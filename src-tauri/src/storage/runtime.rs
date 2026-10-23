//! Backend owner for the database, native vault, and explicit memory-only mode.

use std::{
    fs,
    path::Path,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use secrecy::{ExposeSecret, SecretBox};

use super::kubeconfig::{KubeconfigMetadata, validate_kubeconfig};
use super::{
    Database, EncryptionError, EncryptionKey, MasterKeyVault, PlatformVault, ProfileMetadata,
    SessionOnlyStore, StorageError, VaultError,
};
use crate::storage::database::EncryptedValueSpec;

const DATABASE_FILE: &str = "talos-pilot.sqlite3";
const PROFILE_ID_BYTES: usize = 16;
const REFERENCE_ID_BYTES: usize = 16;
/// Credential kind of the encrypted kubeconfig value itself.
pub(crate) const KUBECONFIG_VALUE_KIND: &str = "kubeconfig";
/// Credential kind of the small encrypted context label beside a kubeconfig.
pub(crate) const KUBECONFIG_LABEL_VALUE_KIND: &str = "kubeconfig-context";
/// Prefix that makes a credential handle's kind explicit and checkable.
const CREDENTIAL_HANDLE_PREFIX: &str = "kubecred-";
/// Nonsensitive profile display name; never carries the user's context label.
const PROFILE_DISPLAY_NAME: &str = "Imported Kubernetes configuration";
/// Upper bound on the number of credentials one listing may report.
///
/// The bound is applied in SQL for stored credentials and by the session
/// store's own entry ceiling, so a listing projection is always bounded.
pub(crate) const MAX_LISTED_CREDENTIALS: usize = 256;

/// One session-only credential's bounded label and zeroizing bytes.
type SessionEntry = (String, SecretBox<[u8]>);

/// Safe, nonsensitive result of storing one imported kubeconfig.
///
/// The handle identifies the stored credential for later resolution. It is not
/// an authorization grant: resolving it re-validates the handle's kind, its
/// owning profile, and the storage mode that currently holds it.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StoredCredential {
    /// Opaque handle for this credential, prefixed with its kind.
    pub handle: String,
    /// Bounded `current-context` label of the imported credential.
    pub context_label: String,
    /// Credential mode the import was written to.
    pub storage_mode: CredentialStorageMode,
}

/// One bounded, nonsensitive entry of a credential listing.
///
/// `storage_mode` describes where this entry currently lives, not what the
/// application would use for a new import: a session-only entry disappears when
/// the process exits, while a persistent entry survives a restart.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StoredCredentialSummary {
    /// Opaque handle for this credential, prefixed with its kind.
    pub handle: String,
    /// Bounded context label derived from the credential's own material.
    pub context_label: String,
    /// Whether this entry is persistent or session-only.
    pub storage_mode: CredentialStorageMode,
}

/// One stored credential resolved for backend use.
///
/// The kubeconfig bytes are returned only to backend callers. They are never
/// logged, serialized, or sent across application IPC; the structure is
/// deliberately not `Debug` or `Clone`.
pub struct ResolvedCredential {
    /// Opaque handle the credential was resolved from.
    pub handle: String,
    /// Bounded context label derived from the credential's own material.
    pub context_label: String,
    /// Whether the credential came from encrypted storage or session memory.
    pub storage_mode: CredentialStorageMode,
    /// Validated kubeconfig bytes, zeroized when dropped.
    pub source: SecretBox<[u8]>,
}

/// Credential persistence state. Session-only is a deliberately separate mode.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CredentialStorageMode {
    /// The OS vault has not been accessed; persistent access will be attempted
    /// by the first import or an explicit retry.
    VaultNotChecked,
    /// Credentials are encrypted with a master key held by the native vault.
    Persistent,
    /// New imports are encrypted, while earlier session-only values remain in
    /// zeroizing memory until shutdown.
    PersistentWithSessionOnly,
    /// The vault is locked, unavailable, or contains invalid key data.
    VaultUnavailable,
    /// Credentials remain only in zeroizing process memory until shutdown.
    SessionOnly,
}

enum CredentialBackend {
    VaultNotChecked,
    Persistent {
        key: EncryptionKey,
        retained_session: Option<SessionOnlyStore>,
    },
    VaultUnavailable,
    SessionOnly(SessionOnlyStore),
}

/// Owns one database connection and the selected credential persistence mode.
///
/// Tauri stores this value behind a mutex. Callers hold that lock through each
/// database transaction or session-store operation, preventing conflicting
/// imports from racing within the process.
pub struct StorageRuntime {
    database: Database,
    vault: Arc<dyn MasterKeyVault>,
    credentials: CredentialBackend,
}

impl StorageRuntime {
    /// Opens the user's application database without touching the OS vault.
    ///
    /// The app-data directory is created with user-only permissions on Unix.
    /// The native vault is accessed only after a user requests an import or an
    /// explicit retry. Database preference reads and production runtime checks
    /// therefore do not create or read OS credentials.
    ///
    /// # Errors
    ///
    /// Returns a safe storage error when the application directory or database
    /// cannot be secured or opened. The OS vault is deliberately untouched.
    pub fn open(app_data_dir: &Path) -> Result<Self, StorageError> {
        secure_data_directory(app_data_dir)?;
        let database_path = app_data_dir.join(DATABASE_FILE);
        reject_symlink(&database_path)?;
        let database = Database::open(&database_path)?;
        secure_database_file(&database_path)?;
        Ok(Self {
            database,
            vault: Arc::new(PlatformVault::new()),
            credentials: CredentialBackend::VaultNotChecked,
        })
    }

    /// Opens an isolated in-memory database for the native-test build.
    ///
    /// This path does not access the user's application data directory or OS
    /// vault. It ensures the actual WebDriver test app cannot create or change
    /// production credentials while exercising unrelated IPC permissions.
    #[cfg(feature = "native-test")]
    pub fn open_native_test() -> Result<Self, StorageError> {
        let database = Database::open(Path::new(":memory:"))?;
        Ok(Self {
            database,
            vault: Arc::new(TestUnavailableVault),
            credentials: CredentialBackend::SessionOnly(SessionOnlyStore::new()),
        })
    }

    /// Reports the active credential persistence mode without exposing errors.
    #[must_use]
    pub fn credential_mode(&self) -> CredentialStorageMode {
        match &self.credentials {
            CredentialBackend::VaultNotChecked => CredentialStorageMode::VaultNotChecked,
            CredentialBackend::Persistent {
                retained_session: Some(_),
                ..
            } => CredentialStorageMode::PersistentWithSessionOnly,
            CredentialBackend::Persistent {
                retained_session: None,
                ..
            } => CredentialStorageMode::Persistent,
            CredentialBackend::VaultUnavailable => CredentialStorageMode::VaultUnavailable,
            CredentialBackend::SessionOnly(_) => CredentialStorageMode::SessionOnly,
        }
    }

    /// Selects session-only operation after a vault failure.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::InvalidMode`] if persistent storage is already
    /// active. Repeating the selection while already session-only is harmless.
    pub fn use_session_only(&mut self) -> Result<(), StorageError> {
        match self.credential_mode() {
            CredentialStorageMode::Persistent
            | CredentialStorageMode::PersistentWithSessionOnly => Err(StorageError::InvalidMode),
            CredentialStorageMode::VaultNotChecked => Err(StorageError::InvalidMode),
            CredentialStorageMode::VaultUnavailable => {
                self.credentials = CredentialBackend::SessionOnly(SessionOnlyStore::new());
                Ok(())
            }
            CredentialStorageMode::SessionOnly => Ok(()),
        }
    }

    /// Retries access to the native vault and switches new imports to persistence.
    ///
    /// If access still fails, the current mode is preserved. If the user
    /// selected session-only operation earlier, those values remain in memory
    /// and the status remains visibly marked as mixed after retry succeeds.
    ///
    /// # Errors
    ///
    /// Returns a safe vault error when the provider remains unavailable or a
    /// safe SQLite error when the database reservation cannot be obtained.
    pub fn retry_persistent(&mut self) -> Result<(), StorageError> {
        let vault = Arc::clone(&self.vault);
        self.retry_persistent_with(vault.as_ref())
    }

    fn retry_persistent_with(&mut self, vault: &dyn MasterKeyVault) -> Result<(), StorageError> {
        let key = self.database.load_or_create_master_key(vault)?;
        let previous =
            std::mem::replace(&mut self.credentials, CredentialBackend::VaultUnavailable);
        let retained_session = match previous {
            CredentialBackend::SessionOnly(session) => Some(session),
            CredentialBackend::Persistent {
                retained_session, ..
            } => retained_session,
            CredentialBackend::VaultNotChecked | CredentialBackend::VaultUnavailable => None,
        };
        self.credentials = CredentialBackend::Persistent {
            key,
            retained_session,
        };
        Ok(())
    }

    /// Reads a persisted, nonsensitive appearance preference.
    pub fn preference(&self, name: &str) -> Result<Option<String>, StorageError> {
        self.database.get_preference(name)
    }

    /// Persists a nonsensitive appearance preference.
    pub fn set_preference(&self, name: &str, value: &str) -> Result<(), StorageError> {
        self.database.set_preference(name, value)
    }

    /// Atomically persists the independent theme and density settings.
    pub fn set_appearance_preferences(
        &mut self,
        theme: &str,
        density: &str,
    ) -> Result<(), StorageError> {
        if !matches!(theme, "system" | "light" | "dark")
            || !matches!(density, "comfortable" | "compact")
        {
            return Err(StorageError::InvalidMetadata);
        }
        self.database
            .set_preferences(&[("appearance-theme", theme), ("appearance-density", density)])
    }

    /// Saves a validated kubeconfig in the currently selected credential mode.
    ///
    /// Persistent mode commits profile metadata, the credential reference, the
    /// small encrypted context label, and the encrypted source bytes in one
    /// transaction. Session-only mode stores the source bytes and their label
    /// only in bounded zeroizing memory. Vault-unavailable mode fails without
    /// creating rows.
    ///
    /// The returned handle identifies the stored credential. No credential
    /// bytes, file path, or raw kubeconfig is included in it or in any other
    /// backend result.
    ///
    /// # Errors
    ///
    /// Returns an error when storage is unavailable, random IDs cannot be
    /// generated, metadata is invalid, or the database transaction fails.
    pub fn store_kubeconfig(
        &mut self,
        metadata: &KubeconfigMetadata,
        source: SecretBox<[u8]>,
    ) -> Result<StoredCredential, StorageError> {
        if !bounded_context_label(&metadata.context_name) {
            return Err(StorageError::InvalidMetadata);
        }
        if self.credential_mode() == CredentialStorageMode::VaultUnavailable {
            return Err(StorageError::Vault(VaultError::Unavailable));
        }
        if self.credential_mode() == CredentialStorageMode::VaultNotChecked {
            match self.database.load_or_create_master_key(self.vault.as_ref()) {
                Ok(key) => {
                    self.credentials = CredentialBackend::Persistent {
                        key,
                        retained_session: None,
                    };
                }
                Err(error @ StorageError::Vault(_)) => {
                    self.credentials = CredentialBackend::VaultUnavailable;
                    return Err(error);
                }
                Err(error) => return Err(error),
            }
        }
        let profile_id = random_identifier(PROFILE_ID_BYTES)?;
        let reference_id = random_identifier(REFERENCE_ID_BYTES)?;
        match &self.credentials {
            CredentialBackend::Persistent { key, .. } => {
                let created_at_unix = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map_err(|_| StorageError::InvalidMetadata)?
                    .as_secs();
                let created_at_unix =
                    i64::try_from(created_at_unix).map_err(|_| StorageError::InvalidMetadata)?;
                let label_reference_id = random_identifier(REFERENCE_ID_BYTES)?;
                let label = SecretBox::new(
                    metadata
                        .context_name
                        .clone()
                        .into_bytes()
                        .into_boxed_slice(),
                );
                self.database.store_profile_encrypted_values(
                    &ProfileMetadata {
                        profile_id,
                        display_name: PROFILE_DISPLAY_NAME.to_owned(),
                        created_at_unix,
                    },
                    &[
                        EncryptedValueSpec {
                            reference_id: &reference_id,
                            value_kind: KUBECONFIG_VALUE_KIND,
                            plaintext: &source,
                        },
                        EncryptedValueSpec {
                            reference_id: &label_reference_id,
                            value_kind: KUBECONFIG_LABEL_VALUE_KIND,
                            plaintext: &label,
                        },
                    ],
                    key,
                )?;
                Ok(StoredCredential {
                    handle: credential_handle(&reference_id),
                    context_label: metadata.context_name.clone(),
                    storage_mode: self.credential_mode(),
                })
            }
            CredentialBackend::SessionOnly(session) => {
                session
                    .insert(&reference_id, &metadata.context_name, source)
                    .map_err(|_| StorageError::InvalidMetadata)?;
                Ok(StoredCredential {
                    handle: credential_handle(&reference_id),
                    context_label: metadata.context_name.clone(),
                    storage_mode: CredentialStorageMode::SessionOnly,
                })
            }
            CredentialBackend::VaultUnavailable => {
                Err(StorageError::Vault(VaultError::Unavailable))
            }
            CredentialBackend::VaultNotChecked => Err(StorageError::InvalidMode),
        }
    }

    /// Lists the stored kubeconfig credentials available to an explicit action.
    ///
    /// This is a user-initiated operation: nothing in the backend calls it at
    /// startup, so opening the shell never reads the vault and never creates a
    /// key. Every label in the projection is derived from encrypted material
    /// (the small stored label, or the credential itself when a row predates
    /// that label), so no plaintext credential label exists in the database.
    ///
    /// Persistent rows need the stored master key. When such rows exist and the
    /// key cannot be read, the listing fails as a whole rather than reporting a
    /// partial set: a projection that silently omitted the stored credentials
    /// would read as "nothing is saved", and a row without its real label would
    /// be indistinguishable from another. The vault is never asked to create a
    /// key for a read.
    ///
    /// Stored references are read at most 256 at a time, bounded in SQL, and
    /// session-only entries are bounded by the session store's own entry
    /// ceiling, so a listing projection is always bounded.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::Vault`] when persistent rows exist but the key
    /// is unavailable, and a safe storage error when the database cannot be
    /// read.
    pub fn list_kubeconfig_credentials(
        &mut self,
    ) -> Result<Vec<StoredCredentialSummary>, StorageError> {
        let mut summaries = Vec::new();
        if let Some(session) = self.session_store() {
            for (reference_id, label) in
                session.list().map_err(|_| StorageError::InvalidMetadata)?
            {
                summaries.push(StoredCredentialSummary {
                    handle: credential_handle(&reference_id),
                    context_label: label,
                    storage_mode: CredentialStorageMode::SessionOnly,
                });
            }
        }

        let references = self
            .database
            .list_references_by_kind(KUBECONFIG_VALUE_KIND, MAX_LISTED_CREDENTIALS)?;
        if references.is_empty() {
            return Ok(summaries);
        }
        let stored = match &self.credentials {
            CredentialBackend::Persistent { key, .. } => self.summarize(&references, key)?,
            CredentialBackend::VaultNotChecked => {
                let key = self.database.load_master_key(self.vault.as_ref())?;
                self.summarize(&references, &key)?
            }
            CredentialBackend::VaultUnavailable | CredentialBackend::SessionOnly(_) => {
                return Err(StorageError::Vault(VaultError::Unavailable));
            }
        };
        summaries.extend(stored);
        Ok(summaries)
    }

    /// Resolves one credential handle to its decrypted kubeconfig material.
    ///
    /// A handle is not an authorization grant. Before any decryption this
    /// checks the handle's kind prefix, finds whether the reference is a
    /// session-only entry or a stored `kubeconfig` reference of some profile,
    /// rejects a reference of any other kind, and rejects a stored reference
    /// while the runtime is in a mode that cannot open it (session-only or
    /// vault-unavailable). A stored reference is decrypted with the kind and
    /// profile recorded for it, so an envelope can never be read as a different
    /// record.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::UnknownCredential`] for a malformed, unknown, or
    /// wrong-kind handle, [`StorageError::Vault`] when a stored credential
    /// exists but the key is unavailable, and a safe error when decryption or
    /// label validation fails. The database lock is released before the caller
    /// performs any network I/O.
    pub fn resolve_kubeconfig_credential(
        &mut self,
        handle: &str,
    ) -> Result<ResolvedCredential, StorageError> {
        let reference_id = handle
            .strip_prefix(CREDENTIAL_HANDLE_PREFIX)
            .filter(|reference| bounded_context_label(reference))
            .ok_or(StorageError::UnknownCredential)?;

        if let Some((context_label, source)) = self.session_entry(reference_id)? {
            return Ok(ResolvedCredential {
                handle: handle.to_owned(),
                context_label,
                storage_mode: CredentialStorageMode::SessionOnly,
                source,
            });
        }

        let (profile_id, value_kind) = self
            .database
            .reference_owner(reference_id)?
            .ok_or(StorageError::UnknownCredential)?;
        if value_kind != KUBECONFIG_VALUE_KIND {
            return Err(StorageError::UnknownCredential);
        }

        let (source, context_label) = match &self.credentials {
            CredentialBackend::Persistent { key, .. } => {
                self.load_stored_credential(&profile_id, reference_id, key)?
            }
            CredentialBackend::VaultNotChecked => {
                let key = self.database.load_master_key(self.vault.as_ref())?;
                self.load_stored_credential(&profile_id, reference_id, &key)?
            }
            CredentialBackend::VaultUnavailable | CredentialBackend::SessionOnly(_) => {
                return Err(StorageError::Vault(VaultError::Unavailable));
            }
        };

        Ok(ResolvedCredential {
            handle: handle.to_owned(),
            context_label,
            storage_mode: CredentialStorageMode::Persistent,
            source,
        })
    }

    /// Borrows the session-only store when this mode retains one.
    fn session_store(&self) -> Option<&SessionOnlyStore> {
        match &self.credentials {
            CredentialBackend::SessionOnly(session) => Some(session),
            CredentialBackend::Persistent {
                retained_session: Some(session),
                ..
            } => Some(session),
            CredentialBackend::VaultNotChecked
            | CredentialBackend::VaultUnavailable
            | CredentialBackend::Persistent {
                retained_session: None,
                ..
            } => None,
        }
    }

    /// Reads one session-only credential's label and bytes.
    fn session_entry(&self, reference_id: &str) -> Result<Option<SessionEntry>, StorageError> {
        let Some(session) = self.session_store() else {
            return Ok(None);
        };
        let label = session
            .with_label(reference_id, str::to_owned)
            .map_err(|_| StorageError::InvalidMetadata)?;
        let source = session
            .with_secret(reference_id, |bytes| {
                SecretBox::new(bytes.to_vec().into_boxed_slice())
            })
            .map_err(|_| StorageError::InvalidMetadata)?;
        Ok(match (label, source) {
            (Some(label), Some(source)) => Some((label, source)),
            _ => None,
        })
    }

    /// Loads and labels one stored credential with the key for its kind.
    fn load_stored_credential(
        &self,
        profile_id: &str,
        reference_id: &str,
        key: &EncryptionKey,
    ) -> Result<(SecretBox<[u8]>, String), StorageError> {
        let source = self.database.load_encrypted_value(
            profile_id,
            reference_id,
            KUBECONFIG_VALUE_KIND,
            key,
        )?;
        let context_label = self.credential_label(profile_id, reference_id, key)?;
        Ok((source, context_label))
    }

    /// Builds the bound credential listing for stored references.
    fn summarize(
        &self,
        references: &[(String, String)],
        key: &EncryptionKey,
    ) -> Result<Vec<StoredCredentialSummary>, StorageError> {
        let mut summaries = Vec::with_capacity(references.len());
        for (reference_id, profile_id) in references {
            summaries.push(StoredCredentialSummary {
                handle: credential_handle(reference_id),
                context_label: self.credential_label(profile_id, reference_id, key)?,
                storage_mode: CredentialStorageMode::Persistent,
            });
        }
        Ok(summaries)
    }

    /// Reads the bounded context label of one stored credential.
    ///
    /// The small encrypted label value is preferred. A row written before that
    /// label existed falls back to re-validating the credential itself, which
    /// is still only decrypted material and never a plaintext database value.
    fn credential_label(
        &self,
        profile_id: &str,
        reference_id: &str,
        key: &EncryptionKey,
    ) -> Result<String, StorageError> {
        if let Some(label_reference_id) = self
            .database
            .reference_for_kind(profile_id, KUBECONFIG_LABEL_VALUE_KIND)?
        {
            let label = self.database.load_encrypted_value(
                profile_id,
                &label_reference_id,
                KUBECONFIG_LABEL_VALUE_KIND,
                key,
            )?;
            if let Ok(label) = std::str::from_utf8(label.expose_secret())
                && bounded_context_label(label)
            {
                return Ok(label.to_owned());
            }
            return Err(StorageError::InvalidMetadata);
        }

        let source = self.database.load_encrypted_value(
            profile_id,
            reference_id,
            KUBECONFIG_VALUE_KIND,
            key,
        )?;
        let metadata = validate_kubeconfig(source.expose_secret())
            .map_err(|_| StorageError::InvalidMetadata)?;
        if !bounded_context_label(&metadata.context_name) {
            return Err(StorageError::InvalidMetadata);
        }
        Ok(metadata.context_name)
    }
}

#[cfg(feature = "native-test")]
struct TestUnavailableVault;

#[cfg(feature = "native-test")]
impl MasterKeyVault for TestUnavailableVault {
    fn load_or_create_key(&self) -> Result<EncryptionKey, VaultError> {
        Err(VaultError::Unavailable)
    }

    fn load_key(&self) -> Result<EncryptionKey, VaultError> {
        Err(VaultError::Unavailable)
    }
}

fn bounded_context_label(value: &str) -> bool {
    super::database::bounded_label(value)
}

/// Builds the opaque handle for one stored kubeconfig credential.
///
/// The handle names the credential kind so a lookup can reject a handle that
/// does not belong to this boundary, and it carries a backend-generated random
/// reference that reveals nothing about the stored value.
fn credential_handle(reference_id: &str) -> String {
    format!("{CREDENTIAL_HANDLE_PREFIX}{reference_id}")
}

fn random_identifier(length: usize) -> Result<String, StorageError> {
    let mut bytes = vec![0_u8; length];
    getrandom::fill(&mut bytes)
        .map_err(|_| StorageError::Encryption(EncryptionError::RandomUnavailable))?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn secure_data_directory(path: &Path) -> Result<(), StorageError> {
    fs::create_dir_all(path)?;
    #[cfg(unix)]
    fs::set_permissions(path, std::os::unix::fs::PermissionsExt::from_mode(0o700))?;
    Ok(())
}

fn reject_symlink(path: &Path) -> Result<(), StorageError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(StorageError::InvalidMetadata),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(StorageError::Filesystem(error)),
    }
}

#[cfg(unix)]
fn secure_database_file(path: &Path) -> Result<(), StorageError> {
    fs::set_permissions(path, std::os::unix::fs::PermissionsExt::from_mode(0o600))?;
    Ok(())
}

/// Windows has no mode bits to set: the database inherits the per-user ACL of
/// the application-data directory.
#[cfg(not(unix))]
fn secure_database_file(_path: &Path) -> Result<(), StorageError> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path, sync::Arc};

    use secrecy::{ExposeSecret, SecretBox};
    use tempfile::tempdir;

    use super::{
        CredentialBackend, CredentialStorageMode, PlatformVault, StorageError, StorageRuntime,
    };
    use crate::storage::{
        Database, EncryptionKey, KubeconfigMetadata, MasterKeyVault, SessionOnlyStore, VaultError,
        validate_kubeconfig,
    };

    const VALID_CONFIG: &[u8] = br#"
apiVersion: v1
kind: Config
current-context: runtime-test
clusters:
  - name: cluster-a
    cluster:
      server: https://127.0.0.1:6443
contexts:
  - name: runtime-test
    context:
      cluster: cluster-a
      user: user-a
users:
  - name: user-a
    user:
      token: runtime-synthetic-secret
"#;

    fn test_key() -> EncryptionKey {
        EncryptionKey::from_secret(SecretBox::new(Box::new([81; 32])))
    }

    struct ReadyVault;

    impl MasterKeyVault for ReadyVault {
        fn load_or_create_key(&self) -> Result<EncryptionKey, VaultError> {
            Ok(test_key())
        }

        fn load_key(&self) -> Result<EncryptionKey, VaultError> {
            Ok(test_key())
        }
    }

    /// A vault that holds no key at all, so only creation would succeed.
    struct AbsentVault;

    impl MasterKeyVault for AbsentVault {
        fn load_or_create_key(&self) -> Result<EncryptionKey, VaultError> {
            Ok(test_key())
        }

        fn load_key(&self) -> Result<EncryptionKey, VaultError> {
            Err(VaultError::Unavailable)
        }
    }

    fn runtime_with_key(database: Database, key: EncryptionKey) -> StorageRuntime {
        StorageRuntime {
            database,
            vault: Arc::new(PlatformVault::new()),
            credentials: CredentialBackend::Persistent {
                key,
                retained_session: None,
            },
        }
    }

    fn credential_source() -> SecretBox<[u8]> {
        SecretBox::new(VALID_CONFIG.to_vec().into_boxed_slice())
    }

    fn metadata() -> KubeconfigMetadata {
        validate_kubeconfig(VALID_CONFIG)
            .unwrap_or_else(|_| panic!("synthetic kubeconfig should validate"))
    }

    #[test]
    fn persistent_import_encrypts_the_complete_source_and_metadata_atomically() {
        let directory = tempdir().unwrap_or_else(|_| panic!("temporary directory should open"));
        let database_path = directory.path().join("storage.sqlite");
        let key = test_key();
        let mut runtime = StorageRuntime {
            database: Database::open(&database_path)
                .unwrap_or_else(|_| panic!("temporary database should open")),
            vault: Arc::new(PlatformVault::new()),
            credentials: CredentialBackend::Persistent {
                key,
                retained_session: None,
            },
        };

        let stored = runtime
            .store_kubeconfig(&metadata(), credential_source())
            .unwrap_or_else(|_| panic!("valid kubeconfig should persist"));
        assert_eq!(stored.storage_mode, CredentialStorageMode::Persistent);
        assert_eq!(stored.context_label, "runtime-test");
        assert!(stored.handle.starts_with("kubecred-"));
        assert_eq!(
            runtime
                .database
                .test_storage_counts()
                .unwrap_or_else(|_| panic!("storage counts should be queryable")),
            (1, 2, 2)
        );
        assert_eq!(
            runtime
                .database
                .test_load_only_secret(match &runtime.credentials {
                    CredentialBackend::Persistent { key, .. } => key,
                    _ => panic!("persistent mode should retain its master key"),
                })
                .unwrap_or_else(|_| panic!("persisted kubeconfig should decrypt"))
                .expose_secret(),
            VALID_CONFIG
        );
        for suffix in ["", "-wal", "-shm", "-journal"] {
            let path = directory.path().join(format!("storage.sqlite{suffix}"));
            if let Ok(contents) = fs::read(path) {
                assert!(
                    !contents
                        .windows(b"runtime-synthetic-secret".len())
                        .any(|window| window == b"runtime-synthetic-secret")
                );
            }
        }
    }

    #[test]
    fn session_only_import_does_not_write_profiles_or_ciphertext_and_dies_with_owner() {
        let database = Database::open(std::path::Path::new(":memory:"))
            .unwrap_or_else(|_| panic!("in-memory database should open"));
        let mut runtime = StorageRuntime {
            database,
            vault: Arc::new(PlatformVault::new()),
            credentials: CredentialBackend::SessionOnly(SessionOnlyStore::new()),
        };
        let stored = runtime
            .store_kubeconfig(&metadata(), credential_source())
            .unwrap_or_else(|_| panic!("valid session import should be retained"));
        assert_eq!(stored.storage_mode, CredentialStorageMode::SessionOnly);
        assert_eq!(
            runtime
                .resolve_kubeconfig_credential(&stored.handle)
                .unwrap_or_else(|_| panic!("session credential should resolve"))
                .context_label,
            "runtime-test"
        );
        let session_values = match &runtime.credentials {
            CredentialBackend::SessionOnly(values) => values,
            _ => panic!("session-only mode should retain its values"),
        };
        assert_eq!(
            session_values
                .credential_count()
                .unwrap_or_else(|_| panic!("session store should remain available")),
            1
        );
        assert_eq!(
            runtime
                .database
                .test_storage_counts()
                .unwrap_or_else(|_| panic!("storage counts should be queryable")),
            (0, 0, 0)
        );
        drop(runtime);

        let next_session = SessionOnlyStore::new();
        assert_eq!(
            next_session
                .credential_count()
                .unwrap_or_else(|_| panic!("new session store should be available")),
            0
        );
    }

    #[test]
    fn vault_failure_requires_an_explicit_session_only_choice() {
        let database = Database::open(std::path::Path::new(":memory:"))
            .unwrap_or_else(|_| panic!("in-memory database should open"));
        let mut runtime = StorageRuntime {
            database,
            vault: Arc::new(PlatformVault::new()),
            credentials: CredentialBackend::VaultUnavailable,
        };
        assert!(matches!(
            runtime.store_kubeconfig(&metadata(), credential_source()),
            Err(StorageError::Vault(_))
        ));
        assert_eq!(
            runtime
                .database
                .test_storage_counts()
                .unwrap_or_else(|_| panic!("storage counts should be queryable")),
            (0, 0, 0)
        );
        runtime
            .use_session_only()
            .unwrap_or_else(|_| panic!("explicit session-only choice should succeed"));
        assert_eq!(
            runtime
                .store_kubeconfig(&metadata(), credential_source())
                .unwrap_or_else(|_| panic!("explicit session-only import should succeed"))
                .storage_mode,
            CredentialStorageMode::SessionOnly
        );
    }

    #[test]
    fn opening_storage_does_not_touch_or_create_an_os_vault_key() {
        let directory = tempdir().unwrap_or_else(|_| panic!("temporary directory should open"));
        let runtime = StorageRuntime::open(directory.path())
            .unwrap_or_else(|_| panic!("isolated database should open"));
        assert_eq!(
            runtime.credential_mode(),
            CredentialStorageMode::VaultNotChecked
        );
    }

    #[test]
    fn retry_keeps_existing_session_credentials_visible_in_memory() {
        let database = Database::open(Path::new(":memory:"))
            .unwrap_or_else(|_| panic!("in-memory database should open"));
        let mut runtime = StorageRuntime {
            database,
            vault: Arc::new(PlatformVault::new()),
            credentials: CredentialBackend::SessionOnly(SessionOnlyStore::new()),
        };
        runtime
            .store_kubeconfig(
                &metadata(),
                SecretBox::new(VALID_CONFIG.to_vec().into_boxed_slice()),
            )
            .unwrap_or_else(|_| panic!("initial session-only import should succeed"));

        runtime
            .retry_persistent_with(&ReadyVault)
            .unwrap_or_else(|_| panic!("explicit vault retry should succeed"));
        assert_eq!(
            runtime.credential_mode(),
            CredentialStorageMode::PersistentWithSessionOnly
        );
        let retained_session_count = match &runtime.credentials {
            CredentialBackend::Persistent {
                retained_session: Some(session),
                ..
            } => session
                .credential_count()
                .unwrap_or_else(|_| panic!("retained session should remain available")),
            _ => panic!("session values should remain visibly marked"),
        };
        assert_eq!(retained_session_count, 1);

        assert_eq!(
            runtime
                .store_kubeconfig(&metadata(), credential_source())
                .unwrap_or_else(|_| panic!("new imports should use persistent storage"))
                .storage_mode,
            CredentialStorageMode::PersistentWithSessionOnly
        );
        assert_eq!(
            runtime
                .database
                .test_storage_counts()
                .unwrap_or_else(|_| panic!("storage counts should be queryable")),
            (1, 2, 2)
        );
    }

    #[test]
    fn resolves_a_persistent_handle_after_a_restart_with_the_stored_key() {
        let directory = tempdir().unwrap_or_else(|_| panic!("temporary directory should open"));
        let database_path = directory.path().join("storage.sqlite");
        let key = test_key();
        let handle = {
            let mut runtime = runtime_with_key(
                Database::open(&database_path)
                    .unwrap_or_else(|_| panic!("temporary database should open")),
                EncryptionKey::from_secret(SecretBox::new(Box::new([81; 32]))),
            );
            let stored = runtime
                .store_kubeconfig(&metadata(), credential_source())
                .unwrap_or_else(|_| panic!("valid kubeconfig should persist"));
            assert_eq!(stored.storage_mode, CredentialStorageMode::Persistent);
            stored.handle
        };

        // A restarted process opens the database without a key in memory and
        // reads the existing vault key rather than creating one.
        let mut restarted = StorageRuntime {
            database: Database::open(&database_path)
                .unwrap_or_else(|_| panic!("database should reopen")),
            vault: Arc::new(ReadyVault),
            credentials: CredentialBackend::VaultNotChecked,
        };
        assert_eq!(
            restarted.credential_mode(),
            CredentialStorageMode::VaultNotChecked
        );
        let listing = restarted
            .list_kubeconfig_credentials()
            .unwrap_or_else(|_| panic!("explicit listing should succeed"));
        assert_eq!(listing.len(), 1);
        assert_eq!(listing[0].handle, handle);
        assert_eq!(listing[0].context_label, "runtime-test");
        assert_eq!(listing[0].storage_mode, CredentialStorageMode::Persistent);

        let resolved = restarted
            .resolve_kubeconfig_credential(&handle)
            .unwrap_or_else(|_| panic!("stored handle should resolve after restart"));
        assert_eq!(resolved.context_label, "runtime-test");
        assert_eq!(resolved.storage_mode, CredentialStorageMode::Persistent);
        assert_eq!(resolved.source.expose_secret(), VALID_CONFIG);
        assert_eq!(key.expose_to_vault(), &[81; 32]);
    }

    #[test]
    fn a_missing_key_leaves_persistent_ciphertext_intact_and_unresolved() {
        let directory = tempdir().unwrap_or_else(|_| panic!("temporary directory should open"));
        let database_path = directory.path().join("storage.sqlite");
        let handle = {
            let mut runtime = runtime_with_key(
                Database::open(&database_path)
                    .unwrap_or_else(|_| panic!("temporary database should open")),
                test_key(),
            );
            runtime
                .store_kubeconfig(&metadata(), credential_source())
                .unwrap_or_else(|_| panic!("valid kubeconfig should persist"))
                .handle
        };
        let before =
            fs::read(&database_path).unwrap_or_else(|_| panic!("database file should be readable"));

        let mut restarted = StorageRuntime {
            database: Database::open(&database_path)
                .unwrap_or_else(|_| panic!("database should reopen")),
            vault: Arc::new(AbsentVault),
            credentials: CredentialBackend::VaultNotChecked,
        };
        assert!(matches!(
            restarted.resolve_kubeconfig_credential(&handle),
            Err(StorageError::Vault(VaultError::Unavailable))
        ));
        assert!(matches!(
            restarted.list_kubeconfig_credentials(),
            Err(StorageError::Vault(VaultError::Unavailable))
        ));
        assert!(
            !fs::read(&database_path)
                .unwrap_or_else(|_| panic!("database file should remain readable"))
                .is_empty(),
            "the encrypted credential must remain stored"
        );
        assert!(
            before.starts_with(b"SQLite format 3\0"),
            "the fixture must be a real SQLite database"
        );
    }

    #[test]
    fn rejects_unknown_and_wrong_kind_handles_before_decryption() {
        let database = Database::open(Path::new(":memory:"))
            .unwrap_or_else(|_| panic!("in-memory database should open"));
        let mut runtime = runtime_with_key(database, test_key());
        for handle in [
            "",
            "kubecred-",
            "talos-session-1",
            "kubecred-unknown-reference",
            "kubecred-unsafe reference",
        ] {
            assert!(
                matches!(
                    runtime.resolve_kubeconfig_credential(handle),
                    Err(StorageError::UnknownCredential)
                ),
                "{handle} must not resolve"
            );
        }

        // A reference of another kind must not be readable through this handle.
        runtime
            .database
            .insert_profile(&crate::storage::ProfileMetadata {
                profile_id: "profile-other".to_owned(),
                display_name: "Synthetic other profile".to_owned(),
                created_at_unix: 1,
            })
            .unwrap_or_else(|_| panic!("synthetic profile should persist"));
        runtime
            .database
            .store_encrypted_value(
                "profile-other",
                "reference-other",
                "talos-client-key",
                match &runtime.credentials {
                    CredentialBackend::Persistent { key, .. } => key,
                    _ => panic!("persistent mode should retain its master key"),
                },
                &credential_source(),
            )
            .unwrap_or_else(|_| panic!("synthetic other value should persist"));
        assert!(matches!(
            runtime.resolve_kubeconfig_credential("kubecred-reference-other"),
            Err(StorageError::UnknownCredential)
        ));
    }

    #[test]
    fn lists_session_only_and_stored_credentials_in_mixed_mode() {
        let database = Database::open(Path::new(":memory:"))
            .unwrap_or_else(|_| panic!("in-memory database should open"));
        let mut runtime = StorageRuntime {
            database,
            vault: Arc::new(ReadyVault),
            credentials: CredentialBackend::SessionOnly(SessionOnlyStore::new()),
        };
        let session = runtime
            .store_kubeconfig(&metadata(), credential_source())
            .unwrap_or_else(|_| panic!("session import should succeed"));
        runtime
            .retry_persistent_with(&ReadyVault)
            .unwrap_or_else(|_| panic!("vault retry should succeed"));
        let persistent = runtime
            .store_kubeconfig(&metadata(), credential_source())
            .unwrap_or_else(|_| panic!("persistent import should succeed"));
        assert_eq!(
            runtime.credential_mode(),
            CredentialStorageMode::PersistentWithSessionOnly
        );

        let listing = runtime
            .list_kubeconfig_credentials()
            .unwrap_or_else(|_| panic!("mixed listing should succeed"));
        assert_eq!(listing.len(), 2);
        let modes = listing
            .iter()
            .map(|entry| (entry.handle.as_str(), entry.storage_mode))
            .collect::<Vec<_>>();
        assert!(modes.contains(&(session.handle.as_str(), CredentialStorageMode::SessionOnly)));
        assert!(modes.contains(&(
            persistent.handle.as_str(),
            CredentialStorageMode::Persistent
        )));
        assert!(
            listing
                .iter()
                .all(|entry| entry.context_label == "runtime-test")
        );

        // Both handles resolve to their own storage path.
        assert_eq!(
            runtime
                .resolve_kubeconfig_credential(&session.handle)
                .unwrap_or_else(|_| panic!("session handle should resolve"))
                .storage_mode,
            CredentialStorageMode::SessionOnly
        );
        assert_eq!(
            runtime
                .resolve_kubeconfig_credential(&persistent.handle)
                .unwrap_or_else(|_| panic!("persistent handle should resolve"))
                .storage_mode,
            CredentialStorageMode::Persistent
        );
    }

    #[test]
    fn stores_only_encrypted_material_for_the_context_label() {
        let directory = tempdir().unwrap_or_else(|_| panic!("temporary directory should open"));
        let database_path = directory.path().join("storage.sqlite");
        let mut runtime = runtime_with_key(
            Database::open(&database_path)
                .unwrap_or_else(|_| panic!("temporary database should open")),
            test_key(),
        );
        runtime
            .store_kubeconfig(&metadata(), credential_source())
            .unwrap_or_else(|_| panic!("valid kubeconfig should persist"));

        for suffix in ["", "-wal", "-shm", "-journal"] {
            let path = directory.path().join(format!("storage.sqlite{suffix}"));
            if let Ok(contents) = fs::read(path) {
                assert!(
                    !contents
                        .windows(b"runtime-test".len())
                        .any(|window| window == b"runtime-test"),
                    "the context label must never appear in plaintext storage"
                );
            }
        }
    }

    #[test]
    fn derives_the_context_label_when_a_row_predates_the_encrypted_label() {
        let database = Database::open(Path::new(":memory:"))
            .unwrap_or_else(|_| panic!("in-memory database should open"));
        let mut runtime = runtime_with_key(database, test_key());
        let stored = runtime
            .store_kubeconfig(&metadata(), credential_source())
            .unwrap_or_else(|_| panic!("valid kubeconfig should persist"));
        let reference_id = stored
            .handle
            .strip_prefix("kubecred-")
            .unwrap_or_else(|| panic!("handle should carry its kind prefix"));
        let (profile_id, value_kind) = runtime
            .database
            .reference_owner(reference_id)
            .unwrap_or_else(|_| panic!("reference should be queryable"))
            .unwrap_or_else(|| panic!("reference should exist"));
        assert_eq!(value_kind, super::KUBECONFIG_VALUE_KIND);

        // Remove the small label value, so the only remaining source of the
        // label is the credential itself.
        runtime
            .database
            .test_delete_reference_for_kind(&profile_id, super::KUBECONFIG_LABEL_VALUE_KIND)
            .unwrap_or_else(|_| panic!("synthetic label removal should succeed"));

        let listing = runtime
            .list_kubeconfig_credentials()
            .unwrap_or_else(|_| panic!("listing should derive the label from the credential"));
        assert_eq!(listing.len(), 1);
        assert_eq!(listing[0].context_label, "runtime-test");
        assert_eq!(
            runtime
                .resolve_kubeconfig_credential(&stored.handle)
                .unwrap_or_else(|_| panic!("resolution should derive the label"))
                .context_label,
            "runtime-test"
        );
    }
}
