//! Backend owner for the database, native vault, and explicit memory-only mode.

use std::{
    fs,
    path::Path,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use secrecy::SecretBox;

use super::kubeconfig::KubeconfigMetadata;
use super::{
    Database, EncryptionError, EncryptionKey, MasterKeyVault, PlatformVault, ProfileMetadata,
    SessionOnlyStore, StorageError, VaultError,
};

const DATABASE_FILE: &str = "talos-pilot.sqlite3";
const PROFILE_ID_BYTES: usize = 16;
const REFERENCE_ID_BYTES: usize = 16;

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
    /// Persistent mode commits profile metadata, reference, and encrypted bytes
    /// together. Session-only mode stores the source bytes only in bounded
    /// zeroizing memory. Vault-unavailable mode fails without creating rows.
    ///
    /// # Errors
    ///
    /// Returns an error when storage is unavailable, random IDs cannot be
    /// generated, metadata is invalid, or the database transaction fails.
    pub fn store_kubeconfig(
        &mut self,
        metadata: &KubeconfigMetadata,
        source: SecretBox<[u8]>,
    ) -> Result<CredentialStorageMode, StorageError> {
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
                self.database.store_profile_encrypted_value(
                    &ProfileMetadata {
                        profile_id,
                        display_name: "Imported Kubernetes configuration".to_owned(),
                        created_at_unix,
                    },
                    &reference_id,
                    "kubeconfig",
                    key,
                    &source,
                )?;
                Ok(self.credential_mode())
            }
            CredentialBackend::SessionOnly(session) => {
                session
                    .insert(&reference_id, source)
                    .map_err(|_| StorageError::InvalidMetadata)?;
                Ok(CredentialStorageMode::SessionOnly)
            }
            CredentialBackend::VaultUnavailable => {
                Err(StorageError::Vault(VaultError::Unavailable))
            }
            CredentialBackend::VaultNotChecked => Err(StorageError::InvalidMode),
        }
    }
}

#[cfg(feature = "native-test")]
struct TestUnavailableVault;

#[cfg(feature = "native-test")]
impl MasterKeyVault for TestUnavailableVault {
    fn load_or_create_key(&self) -> Result<EncryptionKey, VaultError> {
        Err(VaultError::Unavailable)
    }
}

fn bounded_context_label(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && !value.chars().any(|character| {
            character.is_control()
                || matches!(
                    character,
                    '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}'
                )
        })
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

fn secure_database_file(path: &Path) -> Result<(), StorageError> {
    #[cfg(unix)]
    fs::set_permissions(path, std::os::unix::fs::PermissionsExt::from_mode(0o600))?;
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

        assert_eq!(
            runtime
                .store_kubeconfig(
                    &metadata(),
                    SecretBox::new(VALID_CONFIG.to_vec().into_boxed_slice())
                )
                .unwrap_or_else(|_| panic!("valid kubeconfig should persist")),
            CredentialStorageMode::Persistent
        );
        assert_eq!(
            runtime
                .database
                .test_storage_counts()
                .unwrap_or_else(|_| panic!("storage counts should be queryable")),
            (1, 1, 1)
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
        assert_eq!(
            runtime
                .store_kubeconfig(
                    &metadata(),
                    SecretBox::new(VALID_CONFIG.to_vec().into_boxed_slice())
                )
                .unwrap_or_else(|_| panic!("valid session import should be retained")),
            CredentialStorageMode::SessionOnly
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
            runtime.store_kubeconfig(
                &metadata(),
                SecretBox::new(VALID_CONFIG.to_vec().into_boxed_slice())
            ),
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
                .store_kubeconfig(
                    &metadata(),
                    SecretBox::new(VALID_CONFIG.to_vec().into_boxed_slice())
                )
                .unwrap_or_else(|_| panic!("explicit session-only import should succeed")),
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
                .store_kubeconfig(
                    &metadata(),
                    SecretBox::new(VALID_CONFIG.to_vec().into_boxed_slice())
                )
                .unwrap_or_else(|_| panic!("new imports should use persistent storage")),
            CredentialStorageMode::PersistentWithSessionOnly
        );
        assert_eq!(
            runtime
                .database
                .test_storage_counts()
                .unwrap_or_else(|_| panic!("storage counts should be queryable")),
            (1, 1, 1)
        );
    }
}
