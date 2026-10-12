//! Ownership of Kubernetes credential sessions and admitted request capacity.

use std::{
    collections::BTreeMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use secrecy::ExposeSecret;

use super::KubernetesError;
use super::client::build_client;
use crate::storage::{CredentialStorageMode, ResolvedCredential};

/// Maximum number of concurrent Kubernetes credential sessions.
///
/// The Kubernetes adapter admits sessions separately from the Talos credential
/// store: until one cluster profile links both access paths, each adapter owns
/// its own ceiling, and this one is four.
pub const MAX_KUBERNETES_SESSIONS: usize = 4;

/// Maximum number of Kubernetes requests admitted at once across all sessions.
///
/// Admission rejects excess work before a request is dispatched, so a burst of
/// callers cannot queue unbounded work behind a slow API server.
pub const MAX_ADMITTED_REQUESTS: usize = 32;

/// Deadline for one request attempt, including connect and response read.
pub const REQUEST_DEADLINE: Duration = Duration::from_secs(15);

/// Nonsensitive identity of one opened Kubernetes session.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnedSession {
    /// Backend-generated session identifier.
    pub session_id: String,
    /// Bounded context label of the credential the session was opened from.
    pub context_label: String,
    /// Storage mode the credential was resolved from at open time.
    pub storage_mode: CredentialStorageMode,
}

/// Nonsensitive API server version read through one session.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApiserverVersion {
    /// Reported `gitVersion`, for example `v1.36.5`.
    pub version: String,
    /// Reported major version.
    pub major: String,
    /// Reported minor version.
    pub minor: String,
}

/// Owns client sessions built from resolved Kubernetes credentials.
///
/// A session is process-local: closing it, or dropping the store, releases its
/// client. Session-only credential handles cannot be resolved after a restart,
/// so a restarted application can only re-open handles whose credential is
/// still present in the selected storage mode.
///
/// The registry lock is never held across network I/O. Client construction is
/// synchronous and local, so it runs under the lock only after the session
/// limit has been checked; the version read clones the client out and releases
/// the lock before awaiting.
pub struct KubernetesSessionStore {
    sessions: Mutex<BTreeMap<String, ClientSession>>,
    next_id: AtomicU64,
    admission: Arc<tokio::sync::Semaphore>,
}

struct ClientSession {
    client: kube::Client,
}

impl KubernetesSessionStore {
    /// Creates an empty session registry with its full admission capacity.
    #[must_use]
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(BTreeMap::new()),
            next_id: AtomicU64::new(1),
            admission: Arc::new(tokio::sync::Semaphore::new(MAX_ADMITTED_REQUESTS)),
        }
    }

    /// Opens a TLS-validating session for one resolved credential.
    ///
    /// The session limit is enforced before a client is constructed, and the
    /// credential bytes are used only to build that client: they are not
    /// retained in the session, so a later re-read of the same credential does
    /// not depend on a cached copy.
    ///
    /// Client construction is synchronous and local, but the underlying
    /// transport spawns its own worker and therefore requires an asynchronous
    /// runtime context: call this from an async command or test, never from a
    /// blocking thread. The registry lock is held only for that bounded local
    /// work and never across an await.
    ///
    /// # Errors
    ///
    /// Returns [`KubernetesError::SessionLimit`] when the adapter already owns
    /// [`MAX_KUBERNETES_SESSIONS`] sessions, the client-construction errors of
    /// the adapter's client builder, or [`KubernetesError::RegistryUnavailable`]
    /// when the registry lock was poisoned by an earlier panic.
    pub fn open(&self, credential: &ResolvedCredential) -> Result<OwnedSession, KubernetesError> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| KubernetesError::RegistryUnavailable)?;
        if sessions.len() >= MAX_KUBERNETES_SESSIONS {
            return Err(KubernetesError::SessionLimit);
        }
        let client = build_client(credential.source.expose_secret())?;
        // The identifier space is 64 bits wide, so exhaustion cannot occur in a
        // process lifetime; it is still reported as an unavailable registry
        // rather than as a session-limit condition, because a failing counter is
        // not the caller having opened too many sessions.
        let id = self
            .next_id
            .try_update(Ordering::Relaxed, Ordering::Relaxed, |current| {
                current.checked_add(1)
            })
            .map_err(|_| KubernetesError::RegistryUnavailable)?;
        let session_id = format!("kube-session-{id}");
        sessions.insert(session_id.clone(), ClientSession { client });

        Ok(OwnedSession {
            session_id,
            context_label: credential.context_label.clone(),
            storage_mode: credential.storage_mode,
        })
    }

    /// Reads the API server version through one session's client.
    ///
    /// The request is admitted only when a slot is free; otherwise it fails
    /// immediately with [`KubernetesError::CapacityExceeded`] instead of
    /// queueing. The whole attempt, including connection establishment and
    /// response reading, is bounded by [`REQUEST_DEADLINE`].
    ///
    /// # Errors
    ///
    /// Returns [`KubernetesError::SessionUnknown`] for an unknown session,
    /// [`KubernetesError::CapacityExceeded`] when every admission slot is in
    /// use, [`KubernetesError::RegistryUnavailable`] when the session registry
    /// lock was poisoned, the classified SDK failure for a rejected, denied,
    /// transiently failed, or unsupported response,
    /// [`KubernetesError::Unavailable`] on a timeout or unreachable peer, and
    /// [`KubernetesError::UnsupportedResponse`] when a reported field is
    /// missing or outside its bound.
    pub async fn apiserver_version(
        &self,
        session_id: &str,
    ) -> Result<ApiserverVersion, KubernetesError> {
        let client = {
            let sessions = self
                .sessions
                .lock()
                .map_err(|_| KubernetesError::RegistryUnavailable)?;
            sessions
                .get(session_id)
                .ok_or(KubernetesError::SessionUnknown)?
                .client
                .clone()
        };
        let _permit = Arc::clone(&self.admission)
            .try_acquire_owned()
            .map_err(|_| KubernetesError::CapacityExceeded)?;

        let attempt = tokio::time::timeout(REQUEST_DEADLINE, client.apiserver_version()).await;
        let info = match attempt {
            Ok(Ok(info)) => info,
            Ok(Err(error)) => return Err(KubernetesError::from_kube(&error)),
            Err(_) => return Err(KubernetesError::Unavailable),
        };

        Ok(ApiserverVersion {
            version: bounded_version_field(info.git_version)?,
            major: bounded_version_field(info.major)?,
            minor: bounded_version_field(info.minor)?,
        })
    }

    /// Closes one session, releasing its client and admission use.
    ///
    /// # Errors
    ///
    /// Returns [`KubernetesError::RegistryUnavailable`] when the registry lock
    /// was poisoned by an earlier panic.
    pub fn close(&self, session_id: &str) -> Result<bool, KubernetesError> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| KubernetesError::RegistryUnavailable)?;
        Ok(sessions.remove(session_id).is_some())
    }

    /// Reports the number of owned sessions.
    #[cfg(test)]
    pub(super) fn session_count(&self) -> Result<usize, KubernetesError> {
        self.sessions
            .lock()
            .map(|sessions| sessions.len())
            .map_err(|_| KubernetesError::RegistryUnavailable)
    }
}

impl Default for KubernetesSessionStore {
    fn default() -> Self {
        Self::new()
    }
}

/// Bounds one reported version field before it reaches application IPC.
fn bounded_version_field(value: String) -> Result<String, KubernetesError> {
    if value.is_empty()
        || value.len() > 64
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || ".-+_".contains(character))
    {
        return Err(KubernetesError::UnsupportedResponse);
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use secrecy::SecretBox;

    use super::{
        KubernetesSessionStore, MAX_ADMITTED_REQUESTS, MAX_KUBERNETES_SESSIONS,
        bounded_version_field,
    };
    use crate::kubernetes::KubernetesError;
    use crate::storage::{CredentialStorageMode, ResolvedCredential};

    const KUBECONFIG: &[u8] = br#"
apiVersion: v1
kind: Config
current-context: synthetic
clusters:
  - name: cluster-a
    cluster:
      server: https://127.0.0.1:6443
contexts:
  - name: synthetic
    context:
      cluster: cluster-a
      user: user-a
users:
  - name: user-a
    user:
      token: synthetic-token
"#;

    /// A kubeconfig whose selected user needs an exec plugin, which the
    /// adapter refuses before it constructs anything.
    const KUBECONFIG_WITH_EXEC: &[u8] = br#"
apiVersion: v1
kind: Config
current-context: synthetic
clusters:
  - name: cluster-a
    cluster:
      server: https://127.0.0.1:6443
contexts:
  - name: synthetic
    context:
      cluster: cluster-a
      user: user-a
users:
  - name: user-a
    user:
      exec:
        command: /synthetic/plugin
"#;

    fn credential(label: &str) -> ResolvedCredential {
        ResolvedCredential {
            handle: "kubecred-synthetic".to_owned(),
            context_label: label.to_owned(),
            storage_mode: CredentialStorageMode::Persistent,
            source: SecretBox::new(KUBECONFIG.to_vec().into_boxed_slice()),
        }
    }

    #[tokio::test]
    async fn admits_sessions_up_to_the_documented_limit_and_closes_them() {
        let store = KubernetesSessionStore::new();
        let mut ids = Vec::new();
        for index in 0..MAX_KUBERNETES_SESSIONS {
            let session = store
                .open(&credential(&format!("context-{index}")))
                .unwrap_or_else(|_| panic!("session {index} should open"));
            assert_eq!(session.context_label, format!("context-{index}"));
            assert_eq!(session.storage_mode, CredentialStorageMode::Persistent);
            ids.push(session.session_id);
        }
        assert_eq!(
            store.open(&credential("overflow")).err(),
            Some(KubernetesError::SessionLimit)
        );
        assert_eq!(store.session_count().ok(), Some(MAX_KUBERNETES_SESSIONS));

        assert_eq!(store.close(&ids[0]), Ok(true));
        assert_eq!(store.close(&ids[0]), Ok(false));
        assert_eq!(
            store.session_count().ok(),
            Some(MAX_KUBERNETES_SESSIONS - 1)
        );
        assert!(
            store.open(&credential("replacement")).is_ok(),
            "a released slot must be reusable"
        );
        assert_eq!(store.session_count().ok(), Some(MAX_KUBERNETES_SESSIONS));
    }

    #[tokio::test]
    async fn rejects_an_unsupported_credential_before_creating_a_session() {
        let store = KubernetesSessionStore::new();
        let unsupported = ResolvedCredential {
            handle: "kubecred-synthetic".to_owned(),
            context_label: "synthetic".to_owned(),
            storage_mode: CredentialStorageMode::SessionOnly,
            source: SecretBox::new(KUBECONFIG_WITH_EXEC.to_vec().into_boxed_slice()),
        };
        assert_eq!(
            store.open(&unsupported).err(),
            Some(KubernetesError::CredentialInvalid)
        );
        assert_eq!(store.session_count().ok(), Some(0));
    }

    #[tokio::test]
    async fn reads_the_api_server_version_through_an_opened_session() {
        let server = crate::kubernetes::synthetic::SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic server should start"));
        let kubeconfig = server.kubeconfig("synthetic-context", "synthetic-cluster");
        let store = KubernetesSessionStore::new();
        let session = store
            .open(&ResolvedCredential {
                handle: "kubecred-synthetic".to_owned(),
                context_label: "synthetic-context".to_owned(),
                storage_mode: CredentialStorageMode::SessionOnly,
                source: SecretBox::new(kubeconfig.into_bytes().into_boxed_slice()),
            })
            .unwrap_or_else(|_| panic!("synthetic session should open"));

        let version = store
            .apiserver_version(&session.session_id)
            .await
            .unwrap_or_else(|_| panic!("synthetic version read should succeed"));
        assert_eq!(version.version, "v1.36.5");
        assert_eq!(version.major, "1");
        assert_eq!(version.minor, "36");
        assert_eq!(
            server.requests().len(),
            1,
            "the read must reach the injected endpoint exactly once"
        );
        assert_eq!(store.close(&session.session_id), Ok(true));
        server.stop().await;
    }

    #[tokio::test]
    async fn rejects_unknown_sessions_and_exhausted_admission_capacity() {
        let store = KubernetesSessionStore::new();
        assert_eq!(
            store.apiserver_version("kube-session-404").await.err(),
            Some(KubernetesError::SessionUnknown)
        );

        let session = store
            .open(&ResolvedCredential {
                handle: "kubecred-synthetic".to_owned(),
                context_label: "synthetic".to_owned(),
                storage_mode: CredentialStorageMode::Persistent,
                source: SecretBox::new(KUBECONFIG.to_vec().into_boxed_slice()),
            })
            .unwrap_or_else(|_| panic!("session should open"));
        let permits = (0..MAX_ADMITTED_REQUESTS)
            .map(|_| {
                Arc::clone(&store.admission)
                    .try_acquire_owned()
                    .unwrap_or_else(|_| panic!("every admission permit should be available"))
            })
            .collect::<Vec<_>>();
        assert_eq!(permits.len(), MAX_ADMITTED_REQUESTS);
        assert_eq!(
            store.apiserver_version(&session.session_id).await.err(),
            Some(KubernetesError::CapacityExceeded)
        );
        drop(permits);
        assert_eq!(store.admission.available_permits(), MAX_ADMITTED_REQUESTS);
    }

    #[test]
    fn bounds_the_reported_version_fields_before_they_reach_ipc() {
        for accepted in ["v1.36.5", "1", "36", "1.36.0-alpha.1+build"] {
            assert_eq!(
                bounded_version_field(accepted.to_owned()).ok(),
                Some(accepted.to_owned()),
                "{accepted} is a supported version field"
            );
        }
        for rejected in [
            String::new(),
            "x".repeat(65),
            "v1.36.5\n".to_owned(),
            "v1.36.5 <script>".to_owned(),
            "v1.36.5/../etc".to_owned(),
        ] {
            assert_eq!(
                bounded_version_field(rejected.clone()).err(),
                Some(KubernetesError::UnsupportedResponse),
                "{rejected:?} must not reach the renderer"
            );
        }
    }

    #[test]
    fn admission_capacity_is_documented_and_finite() {
        assert_eq!(MAX_ADMITTED_REQUESTS, 32);
        let store = KubernetesSessionStore::new();
        assert_eq!(store.admission.available_permits(), MAX_ADMITTED_REQUESTS);
        let _ = Arc::clone(&store.admission);
    }
}
