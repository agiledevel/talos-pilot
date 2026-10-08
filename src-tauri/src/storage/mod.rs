//! Backend-only SQLite metadata and authenticated encrypted-value storage.
//!
//! This module is not registered as a Tauri command. A
//! vault-backed key provider and all persistent credential workflows belong
//! to C3.2; tests in this packet inject synthetic keys.

mod database;
mod encryption;
mod session;
mod vault;

pub use database::{Database, ProfileMetadata, StorageError};
pub(crate) use encryption::{EncryptedEnvelope, decrypt, encrypt};
pub use encryption::{EncryptionError, EncryptionKey};
pub use session::{SessionOnlyStore, SessionStoreError};
pub use vault::{MasterKeyVault, PlatformVault, VaultError};
