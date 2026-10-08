//! Platform credential-vault access and explicit session-only key creation.

use std::sync::Mutex;

use base64::{Engine, engine::general_purpose::STANDARD};
use keyring::{Entry, Error as KeyringError};
use secrecy::SecretBox;
use zeroize::Zeroizing;

use super::EncryptionKey;

const SERVICE_NAME: &str = "dev.talos-pilot.encryption-key";
const ACCOUNT_NAME: &str = "default";
static VAULT_ACCESS: Mutex<()> = Mutex::new(());

/// A safe category for OS vault failures; it never includes provider details.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum VaultError {
    /// The native vault could not be reached, unlocked, read, or written.
    #[error("the operating system credential vault is unavailable")]
    Unavailable,
    /// The vault returned a key with an unsupported length.
    #[error("the operating system credential vault returned invalid key data")]
    InvalidKey,
    /// Cryptographic randomness could not produce a new master key.
    #[error("secure random bytes are unavailable")]
    RandomUnavailable,
}

/// Provides the persistent master key used to encrypt local database values.
///
/// Implementations must return a non-copyable, zeroizing key and must not log
/// vault responses or key material. A caller that receives [`VaultError`]
/// must stop persistent credential operations until the user selects an
/// explicit session-only mode.
pub trait MasterKeyVault {
    /// Reads the existing application key or creates it in the native vault.
    ///
    /// # Errors
    ///
    /// Returns a safe category for inaccessible/locked vaults, invalid stored
    /// key data, or random source failure. No plaintext fallback is performed.
    fn load_or_create_key(&self) -> Result<EncryptionKey, VaultError>;
}

/// Uses the target's explicitly selected OS credential store.
///
/// Linux builds use Secret Service, macOS builds use Keychain, and Windows
/// builds use Credential Manager. Cargo features disable every implicit mock
/// provider. The single application key is serialized across threads because
/// RPC-backed stores may reject overlapping access to the same credential.
pub struct PlatformVault;

impl PlatformVault {
    /// Creates a provider for the current user's Talos Pilot vault entry.
    #[must_use]
    pub const fn new() -> Self {
        Self
    }

    fn entry(&self) -> Result<Entry, VaultError> {
        Entry::new(SERVICE_NAME, ACCOUNT_NAME).map_err(|_| VaultError::Unavailable)
    }
}

impl Default for PlatformVault {
    fn default() -> Self {
        Self::new()
    }
}

impl MasterKeyVault for PlatformVault {
    fn load_or_create_key(&self) -> Result<EncryptionKey, VaultError> {
        let _guard = VAULT_ACCESS.lock().map_err(|_| VaultError::Unavailable)?;
        let entry = self.entry()?;
        load_or_create_entry(&entry)
    }
}

fn load_or_create_entry(entry: &Entry) -> Result<EncryptionKey, VaultError> {
    match entry.get_password() {
        Ok(encoded) => key_from_encoded(encoded),
        Err(KeyringError::NoEntry) => {
            let key = generate_key()?;
            let encoded = Zeroizing::new(STANDARD.encode(key.expose_to_vault()));
            entry
                .set_password(encoded.as_str())
                .map_err(|_| VaultError::Unavailable)?;
            Ok(key)
        }
        Err(_) => Err(VaultError::Unavailable),
    }
}

fn generate_key() -> Result<EncryptionKey, VaultError> {
    let mut bytes = Box::new([0_u8; 32]);
    getrandom::fill(bytes.as_mut_slice()).map_err(|_| VaultError::RandomUnavailable)?;
    Ok(EncryptionKey::from_secret(SecretBox::new(bytes)))
}

fn key_from_bytes(bytes: Vec<u8>) -> Result<EncryptionKey, VaultError> {
    let boxed = bytes.into_boxed_slice();
    let valid_key: Box<[u8; 32]> = match boxed.try_into() {
        Ok(key) => key,
        Err(invalid) => {
            drop(SecretBox::new(invalid));
            return Err(VaultError::InvalidKey);
        }
    };
    Ok(EncryptionKey::from_secret(SecretBox::new(valid_key)))
}

fn key_from_encoded(encoded: String) -> Result<EncryptionKey, VaultError> {
    let encoded = Zeroizing::new(encoded);
    if encoded.len() != 44 {
        return Err(VaultError::InvalidKey);
    }
    let bytes = STANDARD
        .decode(encoded.as_bytes())
        .map_err(|_| VaultError::InvalidKey)?;
    key_from_bytes(bytes)
}

#[cfg(test)]
mod tests {
    use secrecy::{ExposeSecret, SecretBox};

    use super::{VaultError, key_from_bytes, key_from_encoded, load_or_create_entry};
    use crate::storage::{Database, ProfileMetadata};

    #[test]
    fn rejects_wrong_length_vault_values() {
        assert_eq!(
            key_from_bytes(vec![0; 31]).err(),
            Some(VaultError::InvalidKey)
        );
        assert!(key_from_bytes(vec![0; 32]).is_ok());
        assert_eq!(
            key_from_encoded("not-base64".to_owned()).err(),
            Some(VaultError::InvalidKey)
        );
    }

    /// Run manually with `cargo test vault::tests::native_vault_key_survives_database_reopen -- --ignored`.
    /// The test uses and deletes a uniquely named synthetic key in the user's
    /// real OS vault; it never touches the production application key.
    #[test]
    #[ignore = "requires an unlocked native OS credential vault"]
    fn native_vault_key_survives_database_reopen() {
        let account = format!("integration-{}", std::process::id());
        let entry = keyring::Entry::new("dev.talos-pilot.integration", &account)
            .unwrap_or_else(|_| panic!("native vault entry should be valid"));
        let database_dir = tempfile::tempdir()
            .unwrap_or_else(|_| panic!("temporary database directory should be created"));
        let database_path = database_dir.path().join("storage.sqlite");

        let first_key = load_or_create_entry(&entry)
            .unwrap_or_else(|_| panic!("native vault should persist a synthetic key"));
        {
            let mut database = Database::open(&database_path)
                .unwrap_or_else(|_| panic!("temporary database should open"));
            database
                .insert_profile(&ProfileMetadata {
                    profile_id: "integration-profile".into(),
                    display_name: "Synthetic integration profile".into(),
                    created_at_unix: 1,
                })
                .unwrap_or_else(|_| panic!("synthetic profile should persist"));
            database
                .store_encrypted_value(
                    "integration-profile",
                    "integration-reference",
                    "synthetic",
                    &first_key,
                    &SecretBox::new(
                        b"synthetic-native-vault-sentinel"
                            .to_vec()
                            .into_boxed_slice(),
                    ),
                )
                .unwrap_or_else(|_| panic!("synthetic value should encrypt and persist"));
        }

        let reopened_key = load_or_create_entry(&entry)
            .unwrap_or_else(|_| panic!("native vault should return its existing key"));
        let database =
            Database::open(&database_path).unwrap_or_else(|_| panic!("database should reopen"));
        assert_eq!(
            database
                .load_encrypted_value(
                    "integration-profile",
                    "integration-reference",
                    "synthetic",
                    &reopened_key,
                )
                .unwrap_or_else(|_| panic!("reopened vault key should decrypt the value"))
                .expose_secret(),
            b"synthetic-native-vault-sentinel"
        );
        entry
            .delete_credential()
            .unwrap_or_else(|_| panic!("synthetic vault entry should be deleted"));
    }
}
