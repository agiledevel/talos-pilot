//! Session-only Talos configuration import and bounded target selection.

use std::{
    collections::BTreeMap,
    fs::File,
    io::Read,
    net::IpAddr,
    path::Path,
    str::FromStr,
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
};

use serde::Deserialize;
use serde::de::IgnoredAny;
use zeroize::Zeroizing;

use crate::{
    contracts::{CredentialStorageModeDto, TalosCredentialSessionDto},
    helper::supervisor::TalosProbeInput,
    secret::{SensitiveString, decodes_to_nonempty_base64},
};

/// Maximum number of in-memory Talos credential sessions.
const MAX_SESSIONS: usize = 4;
/// Maximum size of an imported talosconfig file and helper transfer.
pub const MAX_TALOS_CONFIG_BYTES: u64 = 64 * 1024;
const MAX_ENDPOINTS: usize = 8;
const MAX_NODES: usize = 64;

/// Safe failures from native talosconfig import and session lookup.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TalosConfigError {
    /// The file exceeds the configured import bound.
    TooLarge,
    /// The YAML or current context is malformed or unsupported.
    Invalid,
    /// The import contains an unsupported authentication provider or proxy.
    UnsupportedAuthentication,
    /// The session count or sequence bound has been reached.
    SessionLimit,
    /// The selected session or target node does not exist in this process.
    UnknownTarget,
    /// The backend session registry cannot be accessed.
    Unavailable,
}

/// Owns imported Talos credentials in zeroizing process memory.
#[derive(Default)]
pub struct TalosSessionStore {
    sessions: Mutex<BTreeMap<String, TalosSession>>,
    next_id: AtomicU64,
}

struct TalosSession {
    config: Zeroizing<Vec<u8>>,
    endpoints: Vec<String>,
    nodes: Vec<String>,
}

#[derive(Deserialize)]
struct TalosConfigFile {
    context: String,
    contexts: BTreeMap<String, TalosConfigContext>,
}

#[derive(Deserialize)]
struct TalosConfigContext {
    #[serde(default)]
    endpoints: Vec<String>,
    #[serde(default)]
    target: Option<String>,
    #[serde(default)]
    nodes: Vec<String>,
    #[serde(default, rename = "proxy-url")]
    proxy_url: Option<IgnoredAny>,
    #[serde(default)]
    auth: Option<IgnoredAny>,
    #[serde(default)]
    ca: Option<SensitiveString>,
    #[serde(default)]
    crt: Option<SensitiveString>,
    #[serde(default)]
    key: Option<SensitiveString>,
}

impl TalosSessionStore {
    /// Parses and stores a native-selected talosconfig as a session-only credential.
    ///
    /// The parser reads context metadata and the certificate/key values only to
    /// prove they are inline base64; those values are held in zeroizing memory
    /// for validation. The original bounded source remains in a zeroizing
    /// buffer and is never returned to the renderer.
    pub fn insert(
        &self,
        config: Zeroizing<Vec<u8>>,
    ) -> Result<TalosCredentialSessionDto, TalosConfigError> {
        let metadata = parse_config(&config)?;
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| TalosConfigError::Unavailable)?;
        if sessions.len() >= MAX_SESSIONS {
            return Err(TalosConfigError::SessionLimit);
        }
        let id = self
            .next_id
            .try_update(Ordering::Relaxed, Ordering::Relaxed, |current| {
                current.checked_add(1)
            })
            .map_err(|_| TalosConfigError::SessionLimit)?;
        let session_id = format!("talos-session-{id}");
        sessions.insert(
            session_id.clone(),
            TalosSession {
                config,
                endpoints: metadata.endpoints.clone(),
                nodes: metadata.nodes.clone(),
            },
        );

        Ok(TalosCredentialSessionDto {
            session_id,
            context_name: metadata.context_name,
            endpoints: metadata.endpoints,
            nodes: metadata.nodes,
            storage_mode: CredentialStorageModeDto::SessionOnly,
        })
    }

    /// Copies one backend-validated target into a zeroizing helper request.
    pub fn probe_input(
        &self,
        session_id: &str,
        node: &str,
    ) -> Result<TalosProbeInput, TalosConfigError> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| TalosConfigError::Unavailable)?;
        let session = sessions
            .get(session_id)
            .ok_or(TalosConfigError::UnknownTarget)?;
        if !session.nodes.iter().any(|allowed| allowed == node) {
            return Err(TalosConfigError::UnknownTarget);
        }

        Ok(TalosProbeInput {
            config: Zeroizing::new(session.config.to_vec()),
            endpoints: session.endpoints.clone(),
            node: node.to_owned(),
            session_id: session_id.to_owned(),
        })
    }

    /// Removes and zeroizes an in-memory Talos session.
    pub fn remove(&self, session_id: &str) -> Result<bool, TalosConfigError> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| TalosConfigError::Unavailable)?;
        Ok(sessions.remove(session_id).is_some())
    }
}

/// Reads a native picker-selected regular file under the Talos config bound.
pub fn read_talosconfig(path: &Path) -> Result<Zeroizing<Vec<u8>>, TalosConfigError> {
    let file = File::open(path).map_err(|_| TalosConfigError::Invalid)?;
    let metadata = file.metadata().map_err(|_| TalosConfigError::Invalid)?;
    if !metadata.is_file() {
        return Err(TalosConfigError::Invalid);
    }
    if metadata.len() > MAX_TALOS_CONFIG_BYTES {
        return Err(TalosConfigError::TooLarge);
    }
    let mut bytes = Zeroizing::new(Vec::with_capacity(metadata.len() as usize));
    file.take(MAX_TALOS_CONFIG_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| TalosConfigError::Invalid)?;
    if bytes.len() as u64 > MAX_TALOS_CONFIG_BYTES {
        return Err(TalosConfigError::TooLarge);
    }

    Ok(bytes)
}

fn parse_config(source: &[u8]) -> Result<ParsedConfig, TalosConfigError> {
    if source.is_empty() || source.len() as u64 > MAX_TALOS_CONFIG_BYTES {
        return Err(TalosConfigError::Invalid);
    }
    let text = std::str::from_utf8(source).map_err(|_| TalosConfigError::Invalid)?;
    let document: TalosConfigFile =
        serde_saphyr::from_str(text).map_err(|_| TalosConfigError::Invalid)?;
    if !valid_context_name(&document.context) {
        return Err(TalosConfigError::Invalid);
    }
    let context = document
        .contexts
        .get(&document.context)
        .ok_or(TalosConfigError::Invalid)?;
    if context.auth.is_some() || context.proxy_url.is_some() {
        return Err(TalosConfigError::UnsupportedAuthentication);
    }

    let mut endpoints = context.endpoints.clone();
    if let Some(target) = &context.target
        && !endpoints.contains(target)
    {
        endpoints.push(target.clone());
    }
    validate_identities(&endpoints, MAX_ENDPOINTS)?;
    let nodes = if context.nodes.is_empty() {
        endpoints.clone()
    } else {
        context.nodes.clone()
    };
    validate_identities(&nodes, MAX_NODES)?;

    if !valid_inline_material(context.ca.as_ref())
        || !valid_inline_material(context.crt.as_ref())
        || !valid_inline_material(context.key.as_ref())
    {
        return Err(TalosConfigError::UnsupportedAuthentication);
    }

    Ok(ParsedConfig {
        context_name: document.context,
        endpoints,
        nodes,
    })
}

/// Requires inline mTLS material so a path reference can never be read later.
///
/// The pinned Talos client decodes these fields with standard base64, so a
/// non-decoding value is an external file reference the helper must not use.
fn valid_inline_material(value: Option<&SensitiveString>) -> bool {
    value.is_some_and(|value| decodes_to_nonempty_base64(value.expose()))
}

struct ParsedConfig {
    context_name: String,
    endpoints: Vec<String>,
    nodes: Vec<String>,
}

fn validate_identities(values: &[String], maximum: usize) -> Result<(), TalosConfigError> {
    if values.is_empty() || values.len() > maximum {
        return Err(TalosConfigError::Invalid);
    }
    for (index, value) in values.iter().enumerate() {
        if !valid_endpoint(value) || values[..index].contains(value) {
            return Err(TalosConfigError::Invalid);
        }
    }

    Ok(())
}

fn valid_endpoint(value: &str) -> bool {
    if parse_ip(value).is_some() {
        return true;
    }
    let Some((host, port)) = value.rsplit_once(':') else {
        return false;
    };
    let host = host
        .strip_prefix('[')
        .and_then(|host| host.strip_suffix(']'))
        .unwrap_or(host);
    parse_ip(host).is_some() && port.parse::<u16>().is_ok_and(|port| port > 0)
}

fn parse_ip(value: &str) -> Option<IpAddr> {
    IpAddr::from_str(value)
        .ok()
        .filter(|address| !address.is_unspecified())
}

fn valid_context_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value.chars().all(|character| {
            !character.is_control()
                && !matches!(character as u32, 0x202a..=0x202e | 0x2066..=0x2069)
        })
}

#[cfg(test)]
mod tests {
    use zeroize::Zeroizing;

    use super::{TalosConfigError, TalosSessionStore, parse_config};
    use crate::contracts::CredentialStorageModeDto;

    const VALID_CONFIG: &str = "context: synthetic\ncontexts:\n  synthetic:\n    endpoints: [10.79.0.2, 10.79.0.3]\n    nodes: [10.79.0.4, 10.79.0.5]\n    ca: c3ludGhldGljLWNh\n    crt: c3ludGhldGljLWNydA==\n    key: c3ludGhldGljLWtleQ==\n";

    #[test]
    fn parses_only_current_context_and_keeps_endpoint_and_node_identities_separate() {
        let parsed = parse_config(VALID_CONFIG.as_bytes())
            .unwrap_or_else(|_| panic!("synthetic Talos config must be accepted"));
        assert_eq!(parsed.context_name, "synthetic");
        assert_eq!(parsed.endpoints, ["10.79.0.2", "10.79.0.3"]);
        assert_eq!(parsed.nodes, ["10.79.0.4", "10.79.0.5"]);
    }

    #[test]
    fn rejects_external_authentication_and_invalid_endpoint_lists() {
        let auth = VALID_CONFIG.replace(
            "    key: c3ludGhldGljLWtleQ==\n",
            "    key: c3ludGhldGljLWtleQ==\n    auth: { basic: { username: user, password: secret } }\n",
        );
        assert!(matches!(
            parse_config(auth.as_bytes()),
            Err(TalosConfigError::UnsupportedAuthentication)
        ));

        let proxy = VALID_CONFIG.replace(
            "    key: c3ludGhldGljLWtleQ==\n",
            "    key: c3ludGhldGljLWtleQ==\n    proxy-url: http://127.0.0.1:8080\n",
        );
        assert!(matches!(
            parse_config(proxy.as_bytes()),
            Err(TalosConfigError::UnsupportedAuthentication)
        ));

        let invalid_node = VALID_CONFIG.replace("10.79.0.5", "node.example");
        assert!(matches!(
            parse_config(invalid_node.as_bytes()),
            Err(TalosConfigError::Invalid)
        ));
    }

    #[test]
    fn rejects_file_path_and_empty_mtls_material() {
        let path_reference = VALID_CONFIG.replace(
            "    ca: c3ludGhldGljLWNh\n",
            "    ca: /home/operator/ca.crt\n",
        );
        assert!(matches!(
            parse_config(path_reference.as_bytes()),
            Err(TalosConfigError::UnsupportedAuthentication)
        ));

        let missing_key = VALID_CONFIG.replace("    key: c3ludGhldGljLWtleQ==\n", "");
        assert!(matches!(
            parse_config(missing_key.as_bytes()),
            Err(TalosConfigError::UnsupportedAuthentication)
        ));

        let empty_key = VALID_CONFIG.replace("    key: c3ludGhldGljLWtleQ==\n", "    key: \"\"\n");
        assert!(matches!(
            parse_config(empty_key.as_bytes()),
            Err(TalosConfigError::UnsupportedAuthentication)
        ));
    }

    #[test]
    fn stores_credentials_session_only_and_rejects_unlisted_nodes() {
        let store = TalosSessionStore::default();
        let summary = store
            .insert(Zeroizing::new(VALID_CONFIG.as_bytes().to_vec()))
            .unwrap_or_else(|_| panic!("session-only import must succeed"));
        assert_eq!(summary.storage_mode, CredentialStorageModeDto::SessionOnly);
        let input = store
            .probe_input(&summary.session_id, "10.79.0.4")
            .unwrap_or_else(|_| panic!("listed node must be allowed"));
        assert_eq!(input.endpoints, ["10.79.0.2", "10.79.0.3"]);
        assert_eq!(input.node, "10.79.0.4");
        assert!(matches!(
            store.probe_input(&summary.session_id, "10.79.0.9"),
            Err(TalosConfigError::UnknownTarget)
        ));
        assert!(
            store
                .remove(&summary.session_id)
                .unwrap_or_else(|_| panic!("session removal must succeed"))
        );
    }
}
