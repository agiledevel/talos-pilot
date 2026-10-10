//! Versioned SQLite schema and transactional access to encrypted values.

use std::{path::Path, time::Duration};

use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use secrecy::SecretBox;

use super::{
    EncryptedEnvelope, EncryptionError, EncryptionKey, MasterKeyVault, VaultError, decrypt, encrypt,
};

pub(crate) const MAX_IDENTIFIER_BYTES: usize = 128;
pub(crate) const MAX_SECRET_BYTES: usize = 16 * 1024 * 1024;
const CURRENT_SCHEMA_VERSION: i64 = 1;
const MAX_DISPLAY_NAME_BYTES: usize = 256;
const MIGRATION_V1: &str = r#"
CREATE TABLE profiles (
  profile_id TEXT PRIMARY KEY NOT NULL
    CHECK(length(profile_id) BETWEEN 1 AND 128),
  display_name TEXT NOT NULL
    CHECK(length(display_name) BETWEEN 1 AND 256),
  created_at_unix INTEGER NOT NULL CHECK(created_at_unix >= 0)
) STRICT;

CREATE TABLE credential_references (
  reference_id TEXT PRIMARY KEY NOT NULL
    CHECK(length(reference_id) BETWEEN 1 AND 128),
  profile_id TEXT NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
  value_kind TEXT NOT NULL
    CHECK(length(value_kind) BETWEEN 1 AND 128),
  UNIQUE(profile_id, value_kind)
) STRICT;

CREATE TABLE encrypted_values (
  reference_id TEXT PRIMARY KEY NOT NULL
    REFERENCES credential_references(reference_id) ON DELETE CASCADE,
  envelope_version INTEGER NOT NULL CHECK(envelope_version = 1),
  nonce BLOB NOT NULL CHECK(length(nonce) = 24),
  ciphertext BLOB NOT NULL
    CHECK(length(ciphertext) BETWEEN 16 AND 16777232)
) STRICT;

CREATE TABLE preferences (
  name TEXT PRIMARY KEY NOT NULL
    CHECK(length(name) BETWEEN 1 AND 64),
  value TEXT NOT NULL
    CHECK(length(value) BETWEEN 1 AND 256)
) STRICT;
"#;

/// A bounded nonsecret description persisted separately from credentials.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProfileMetadata {
    /// Opaque stable profile identifier, bounded to 128 UTF-8 bytes.
    pub profile_id: String,
    /// Nonsensitive display name, bounded to 256 UTF-8 bytes.
    pub display_name: String,
    /// Creation time as nonnegative UTC seconds since the Unix epoch.
    pub created_at_unix: i64,
}

/// Errors returned by the local metadata database and encrypted-value adapter.
#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    /// SQLite rejected an operation or could not open the database.
    #[error("storage database operation failed")]
    Database(#[from] rusqlite::Error),
    /// The database schema is newer than this application supports.
    #[error("storage database schema version is unsupported")]
    UnsupportedSchema,
    /// A bounded storage identifier or metadata field is invalid.
    #[error("storage metadata is invalid")]
    InvalidMetadata,
    /// The requested encrypted value does not exist.
    #[error("encrypted value is missing")]
    MissingValue,
    /// Encryption, parsing, or authentication failed.
    #[error(transparent)]
    Encryption(#[from] EncryptionError),
    /// The native credential vault could not provide a persistent key.
    #[error(transparent)]
    Vault(#[from] VaultError),
    /// The selected application database directory or file is inaccessible.
    #[error("storage files are unavailable")]
    Filesystem(#[from] std::io::Error),
    /// The requested credential mode is not available from the current state.
    #[error("the requested credential storage mode is unavailable")]
    InvalidMode,
}

/// Owns a single SQLite connection and applies versioned migrations atomically.
///
/// Callers retain this value in the backend. It is not serializable or exposed
/// through Tauri IPC, and it stores sensitive payloads only as AEAD envelopes.
pub struct Database {
    connection: Connection,
}

impl Database {
    /// Opens the backend database and migrates a fresh file to schema version 1.
    ///
    /// Journal mode and foreign-key enforcement are enabled before migrations.
    /// The schema is deliberately limited to profile metadata, credential
    /// references, encrypted values, and nonsensitive preferences.
    ///
    /// # Errors
    ///
    /// Returns a safe storage error if the database cannot be opened, a
    /// migration fails, or its schema version is newer than this application.
    ///
    /// The path must be selected by trusted backend code. Renderer-provided
    /// paths are not accepted by this storage boundary.
    pub fn open(path: &Path) -> Result<Self, StorageError> {
        let mut connection = Connection::open(path)?;
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        migrate(&mut connection)?;
        let _: String = connection.query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))?;
        connection.pragma_update(None, "synchronous", "FULL")?;
        Ok(Self { connection })
    }

    /// Loads or creates the persistent master key while holding SQLite's
    /// cross-process write reservation.
    ///
    /// Every application instance must use this method rather than calling
    /// the vault directly. The immediate transaction serializes first-key
    /// creation across processes that share this database file, preventing a
    /// second instance from overwriting a key after the first has encrypted
    /// records with it. The transaction commits before the key is returned.
    ///
    /// # Errors
    ///
    /// Returns an error if SQLite cannot obtain the reservation or if the
    /// vault is missing, locked, unavailable, or contains invalid key data.
    pub fn load_or_create_master_key(
        &mut self,
        vault: &dyn MasterKeyVault,
    ) -> Result<EncryptionKey, StorageError> {
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let key = vault.load_or_create_key()?;
        transaction.commit()?;
        Ok(key)
    }

    /// Persists nonsensitive profile metadata using parameterized SQL.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid bounded metadata or when SQLite rejects
    /// the insert, including a duplicate profile identifier.
    pub fn insert_profile(&self, profile: &ProfileMetadata) -> Result<(), StorageError> {
        if !bounded_text(&profile.profile_id, MAX_IDENTIFIER_BYTES)
            || !bounded_text(&profile.display_name, MAX_DISPLAY_NAME_BYTES)
            || profile.created_at_unix < 0
        {
            return Err(StorageError::InvalidMetadata);
        }
        self.connection.execute(
            "INSERT INTO profiles(profile_id, display_name, created_at_unix) VALUES (?1, ?2, ?3)",
            params![
                profile.profile_id,
                profile.display_name,
                profile.created_at_unix
            ],
        )?;
        Ok(())
    }

    /// Persists or replaces a bounded nonsensitive preference.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::InvalidMetadata`] for invalid bounds or a safe
    /// SQLite error when the value cannot be committed.
    pub fn set_preference(&self, name: &str, value: &str) -> Result<(), StorageError> {
        if !bounded_text(name, 64) || !bounded_text(value, 256) {
            return Err(StorageError::InvalidMetadata);
        }
        self.connection.execute(
            "INSERT INTO preferences(name, value) VALUES (?1, ?2) \
             ON CONFLICT(name) DO UPDATE SET value = excluded.value",
            params![name, value],
        )?;
        Ok(())
    }

    /// Atomically updates a bounded group of nonsensitive preferences.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::InvalidMetadata`] for invalid bounds or a safe
    /// SQLite error; on failure none of the supplied values are changed.
    pub fn set_preferences(&mut self, preferences: &[(&str, &str)]) -> Result<(), StorageError> {
        if preferences
            .iter()
            .any(|(name, value)| !bounded_text(name, 64) || !bounded_text(value, 256))
        {
            return Err(StorageError::InvalidMetadata);
        }
        let transaction = self.connection.transaction()?;
        for (name, value) in preferences {
            transaction.execute(
                "INSERT INTO preferences(name, value) VALUES (?1, ?2) \
                 ON CONFLICT(name) DO UPDATE SET value = excluded.value",
                params![name, value],
            )?;
        }
        transaction.commit()?;
        Ok(())
    }

    /// Loads a bounded nonsensitive preference, if one has been stored.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::InvalidMetadata`] for an invalid name or a safe
    /// SQLite error when the value cannot be read.
    pub fn get_preference(&self, name: &str) -> Result<Option<String>, StorageError> {
        if !bounded_text(name, 64) {
            return Err(StorageError::InvalidMetadata);
        }
        Ok(self
            .connection
            .query_row(
                "SELECT value FROM preferences WHERE name = ?1",
                [name],
                |row| row.get(0),
            )
            .optional()?)
    }

    /// Stores an encrypted value and its reference in one transaction.
    ///
    /// The AEAD associated data binds the ciphertext to `profile_id`,
    /// `reference_id`, and `value_kind`, preventing record swapping. If any SQL
    /// statement fails, both reference and ciphertext changes roll back.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid identities, oversized plaintext, random
    /// source failure, a missing profile, or a database/cryptographic failure.
    pub fn store_encrypted_value(
        &mut self,
        profile_id: &str,
        reference_id: &str,
        value_kind: &str,
        key: &EncryptionKey,
        plaintext: &SecretBox<[u8]>,
    ) -> Result<(), StorageError> {
        if !bounded_text(profile_id, MAX_IDENTIFIER_BYTES)
            || !bounded_text(reference_id, MAX_IDENTIFIER_BYTES)
            || !bounded_text(value_kind, MAX_IDENTIFIER_BYTES)
        {
            return Err(StorageError::InvalidMetadata);
        }
        let envelope = encrypt(key, profile_id, reference_id, value_kind, plaintext)?;
        let transaction = self.connection.transaction()?;
        store_envelope_rows(
            &transaction,
            profile_id,
            reference_id,
            value_kind,
            &envelope,
        )?;
        transaction.commit()?;
        Ok(())
    }

    /// Inserts a new profile and its encrypted value in one transaction.
    ///
    /// Import workflows use this method so a failed credential write cannot
    /// leave an orphan profile or credential reference.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid metadata, oversized plaintext, random
    /// source failure, database constraints, or cryptographic failure.
    pub fn store_profile_encrypted_value(
        &mut self,
        profile: &ProfileMetadata,
        reference_id: &str,
        value_kind: &str,
        key: &EncryptionKey,
        plaintext: &SecretBox<[u8]>,
    ) -> Result<(), StorageError> {
        if !bounded_text(&profile.profile_id, MAX_IDENTIFIER_BYTES)
            || !bounded_text(&profile.display_name, MAX_DISPLAY_NAME_BYTES)
            || profile.created_at_unix < 0
            || !bounded_text(reference_id, MAX_IDENTIFIER_BYTES)
            || !bounded_text(value_kind, MAX_IDENTIFIER_BYTES)
        {
            return Err(StorageError::InvalidMetadata);
        }
        let envelope = encrypt(
            key,
            &profile.profile_id,
            reference_id,
            value_kind,
            plaintext,
        )?;
        let transaction = self.connection.transaction()?;
        transaction.execute(
            "INSERT INTO profiles(profile_id, display_name, created_at_unix) \
             VALUES (?1, ?2, ?3)",
            params![
                profile.profile_id,
                profile.display_name,
                profile.created_at_unix
            ],
        )?;
        store_envelope_rows(
            &transaction,
            &profile.profile_id,
            reference_id,
            value_kind,
            &envelope,
        )?;
        transaction.commit()?;
        Ok(())
    }

    /// Loads and authenticates an encrypted value for its original identity.
    ///
    /// # Errors
    ///
    /// Returns an error for a missing reference, unsupported/malformed
    /// envelope, oversized ciphertext, database failure, or authentication
    /// failure.
    pub fn load_encrypted_value(
        &self,
        profile_id: &str,
        reference_id: &str,
        value_kind: &str,
        key: &EncryptionKey,
    ) -> Result<SecretBox<[u8]>, StorageError> {
        let row = self
            .connection
            .query_row(
                "SELECT e.envelope_version, e.nonce, e.ciphertext \
                 FROM encrypted_values e \
                 JOIN credential_references r ON r.reference_id = e.reference_id \
                 WHERE r.profile_id = ?1 AND r.reference_id = ?2 AND r.value_kind = ?3",
                params![profile_id, reference_id, value_kind],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, Vec<u8>>(1)?,
                        row.get::<_, Vec<u8>>(2)?,
                    ))
                },
            )
            .optional()?
            .ok_or(StorageError::MissingValue)?;
        let version = u8::try_from(row.0).map_err(|_| EncryptionError::InvalidEnvelope)?;
        let envelope = EncryptedEnvelope {
            version,
            nonce: row.1,
            ciphertext: row.2,
        };
        Ok(decrypt(
            key,
            profile_id,
            reference_id,
            value_kind,
            &envelope,
        )?)
    }

    #[cfg(test)]
    fn schema_version(&self) -> Result<i64, StorageError> {
        Ok(self
            .connection
            .pragma_query_value(None, "user_version", |row| row.get(0))?)
    }

    #[cfg(test)]
    pub(super) fn test_storage_counts(&self) -> Result<(i64, i64, i64), StorageError> {
        let profiles = self
            .connection
            .query_row("SELECT COUNT(*) FROM profiles", [], |row| row.get(0))?;
        let references =
            self.connection
                .query_row("SELECT COUNT(*) FROM credential_references", [], |row| {
                    row.get(0)
                })?;
        let values =
            self.connection
                .query_row("SELECT COUNT(*) FROM encrypted_values", [], |row| {
                    row.get(0)
                })?;
        Ok((profiles, references, values))
    }

    #[cfg(test)]
    pub(super) fn test_load_only_secret(
        &self,
        key: &EncryptionKey,
    ) -> Result<SecretBox<[u8]>, StorageError> {
        let (profile_id, reference_id, value_kind) = self.connection.query_row(
            "SELECT profile_id, reference_id, value_kind FROM credential_references LIMIT 1",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )?;
        self.load_encrypted_value(&profile_id, &reference_id, &value_kind, key)
    }
}

fn store_envelope_rows(
    transaction: &rusqlite::Transaction<'_>,
    profile_id: &str,
    reference_id: &str,
    value_kind: &str,
    envelope: &EncryptedEnvelope,
) -> Result<(), rusqlite::Error> {
    transaction.execute(
        "INSERT INTO credential_references(reference_id, profile_id, value_kind) \
             VALUES (?1, ?2, ?3) \
             ON CONFLICT(reference_id) DO UPDATE SET \
               profile_id = excluded.profile_id, value_kind = excluded.value_kind",
        params![reference_id, profile_id, value_kind],
    )?;
    transaction.execute(
        "INSERT INTO encrypted_values(reference_id, envelope_version, nonce, ciphertext) \
             VALUES (?1, ?2, ?3, ?4) \
             ON CONFLICT(reference_id) DO UPDATE SET \
               envelope_version = excluded.envelope_version, \
               nonce = excluded.nonce, ciphertext = excluded.ciphertext",
        params![
            reference_id,
            i64::from(envelope.version),
            envelope.nonce,
            envelope.ciphertext
        ],
    )?;
    Ok(())
}

fn migrate(connection: &mut Connection) -> Result<(), StorageError> {
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let version: i64 = transaction.pragma_query_value(None, "user_version", |row| row.get(0))?;
    match version {
        0 => {
            transaction.execute_batch(MIGRATION_V1)?;
            transaction.pragma_update(None, "user_version", CURRENT_SCHEMA_VERSION)?;
            transaction.commit()?;
            Ok(())
        }
        CURRENT_SCHEMA_VERSION => {
            transaction.commit()?;
            Ok(())
        }
        _ => Err(StorageError::UnsupportedSchema),
    }
}

fn bounded_text(value: &str, maximum_bytes: usize) -> bool {
    !value.is_empty() && value.len() <= maximum_bytes
}

#[cfg(test)]
mod tests {
    use std::{
        fmt::Debug,
        fs,
        path::{Path, PathBuf},
        sync::{
            Arc, Barrier, Mutex,
            atomic::{AtomicU8, Ordering},
        },
        thread,
    };

    use rusqlite::{Connection, params};
    use secrecy::{ExposeSecret, SecretBox};
    use tempfile::{TempDir, tempdir};

    use super::{
        CURRENT_SCHEMA_VERSION, Database, MAX_SECRET_BYTES, ProfileMetadata, StorageError,
    };
    use crate::storage::{EncryptionKey, MasterKeyVault, VaultError};

    const PLAINTEXT_SENTINEL: &[u8] = b"synthetic-secret-marker-for-storage";

    fn must<T, E: Debug>(result: Result<T, E>) -> T {
        result.unwrap_or_else(|error| panic!("expected storage operation to succeed: {error:?}"))
    }

    fn temporary_database() -> (TempDir, PathBuf) {
        let directory = must(tempdir());
        let path = directory.path().join("profiles.db");
        (directory, path)
    }

    fn profile() -> ProfileMetadata {
        ProfileMetadata {
            profile_id: "profile-1".to_owned(),
            display_name: "Synthetic profile".to_owned(),
            created_at_unix: 1_797_408_000,
        }
    }

    fn test_key(fill: u8) -> EncryptionKey {
        EncryptionKey::from_secret(SecretBox::new(Box::new([fill; 32])))
    }

    struct ConcurrentVault {
        key: Mutex<Option<[u8; 32]>>,
        next_fill: AtomicU8,
    }

    impl MasterKeyVault for ConcurrentVault {
        fn load_or_create_key(&self) -> Result<EncryptionKey, VaultError> {
            if let Some(existing) = *self.key.lock().map_err(|_| VaultError::Unavailable)? {
                return Ok(EncryptionKey::from_secret(SecretBox::new(Box::new(
                    existing,
                ))));
            }
            thread::sleep(std::time::Duration::from_millis(25));
            let candidate = [self.next_fill.fetch_add(1, Ordering::Relaxed); 32];
            *self.key.lock().map_err(|_| VaultError::Unavailable)? = Some(candidate);
            Ok(EncryptionKey::from_secret(SecretBox::new(Box::new(
                candidate,
            ))))
        }
    }

    struct UnavailableVault;

    impl MasterKeyVault for UnavailableVault {
        fn load_or_create_key(&self) -> Result<EncryptionKey, VaultError> {
            Err(VaultError::Unavailable)
        }
    }

    fn contains_plaintext(path: &Path, sentinel: &[u8]) -> bool {
        ["", "-wal", "-shm", "-journal"].into_iter().any(|suffix| {
            let artifact = PathBuf::from(format!("{}{suffix}", path.display()));
            fs::read(artifact).is_ok_and(|bytes| {
                bytes
                    .windows(sentinel.len())
                    .any(|window| window == sentinel)
            })
        })
    }

    #[test]
    fn creates_schema_v1_and_persists_only_encrypted_secret_bytes() {
        let (_directory, path) = temporary_database();
        let key = test_key(7);
        {
            let mut database = must(Database::open(&path));
            assert_eq!(must(database.schema_version()), 1);
            must(database.insert_profile(&profile()));
            must(database.connection.execute(
                "INSERT INTO preferences(name, value) VALUES (?1, ?2)",
                params!["appearance", "dark"],
            ));
            must(database.store_encrypted_value(
                "profile-1",
                "credential-1",
                "talos-client-key",
                &key,
                &SecretBox::new(PLAINTEXT_SENTINEL.to_vec().into_boxed_slice()),
            ));

            let row: (i64, Vec<u8>, Vec<u8>) = must(database.connection.query_row(
                "SELECT envelope_version, nonce, ciphertext FROM encrypted_values \
                 WHERE reference_id = ?1",
                ["credential-1"],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            ));
            assert_eq!(row.0, 1);
            assert_eq!(row.1.len(), 24);
            assert!(row.2.len() >= 16);
            assert!(!contains_plaintext(&path, PLAINTEXT_SENTINEL));
        }

        assert!(!contains_plaintext(&path, PLAINTEXT_SENTINEL));
        let reopened = must(Database::open(&path));
        let secret = must(reopened.load_encrypted_value(
            "profile-1",
            "credential-1",
            "talos-client-key",
            &key,
        ));
        assert_eq!(secret.expose_secret(), PLAINTEXT_SENTINEL);

        let preference: String = must(reopened.connection.query_row(
            "SELECT value FROM preferences WHERE name = ?1",
            ["appearance"],
            |row| row.get(0),
        ));
        assert_eq!(preference, "dark");
    }

    #[test]
    fn persists_bounded_appearance_preferences() {
        let (_directory, path) = temporary_database();
        let database = must(Database::open(&path));
        assert_eq!(must(database.get_preference("theme")), None);
        must(database.set_preference("theme", "system"));
        must(database.set_preference("density", "compact"));
        must(database.set_preference("theme", "dark"));
        assert_eq!(
            must(database.get_preference("theme")),
            Some("dark".to_owned())
        );
        assert_eq!(
            must(database.get_preference("density")),
            Some("compact".to_owned())
        );
        assert!(matches!(
            database.set_preference("theme", &"x".repeat(257)),
            Err(StorageError::InvalidMetadata)
        ));
    }

    #[test]
    fn appearance_preference_group_updates_atomically() {
        let (_directory, path) = temporary_database();
        let mut database = must(Database::open(&path));
        must(database.set_preferences(&[
            ("appearance-theme", "system"),
            ("appearance-density", "comfortable"),
        ]));
        must(database.connection.execute_batch(
            "CREATE TRIGGER reject_compact BEFORE INSERT ON preferences \
             WHEN NEW.name = 'appearance-density' \
             BEGIN SELECT RAISE(ABORT, 'synthetic preference failure'); END;",
        ));
        assert!(matches!(
            database.set_preferences(&[
                ("appearance-theme", "dark"),
                ("appearance-density", "compact"),
            ]),
            Err(StorageError::Database(_))
        ));
        assert_eq!(
            must(database.get_preference("appearance-theme")),
            Some("system".into())
        );
        assert_eq!(
            must(database.get_preference("appearance-density")),
            Some("comfortable".into())
        );
    }

    #[test]
    fn failed_import_write_rolls_back_profile_reference_and_envelope() {
        let (_directory, path) = temporary_database();
        let mut database = must(Database::open(&path));
        must(database.connection.execute_batch(
            "CREATE TRIGGER reject_import BEFORE INSERT ON encrypted_values \
             BEGIN SELECT RAISE(ABORT, 'synthetic import failure'); END;",
        ));
        assert!(matches!(
            database.store_profile_encrypted_value(
                &profile(),
                "credential-import",
                "kubeconfig",
                &test_key(33),
                &SecretBox::new(PLAINTEXT_SENTINEL.to_vec().into_boxed_slice()),
            ),
            Err(StorageError::Database(_))
        ));
        let profiles: i64 = must(database.connection.query_row(
            "SELECT COUNT(*) FROM profiles",
            [],
            |row| row.get(0),
        ));
        let references: i64 = must(database.connection.query_row(
            "SELECT COUNT(*) FROM credential_references",
            [],
            |row| row.get(0),
        ));
        assert_eq!(profiles, 0);
        assert_eq!(references, 0);
    }

    #[test]
    fn failed_fresh_migration_rolls_back_prior_table_creation() {
        let (_directory, path) = temporary_database();
        let conflict = must(Connection::open(&path));
        must(conflict.execute_batch(
            "CREATE TABLE credential_references (sentinel TEXT); \
             INSERT INTO credential_references(sentinel) VALUES ('preexisting-record');",
        ));
        drop(conflict);

        assert!(matches!(
            Database::open(&path),
            Err(StorageError::Database(_))
        ));
        let verification = must(Connection::open(&path));
        let profile_table_exists: bool = must(verification.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'profiles')",
            [],
            |row| row.get(0),
        ));
        let version: i64 =
            must(verification.pragma_query_value(None, "user_version", |row| row.get(0)));
        let preserved_record: String = must(verification.query_row(
            "SELECT sentinel FROM credential_references",
            [],
            |row| row.get(0),
        ));
        assert!(!profile_table_exists);
        assert_eq!(version, 0);
        assert_eq!(preserved_record, "preexisting-record");
    }

    #[test]
    fn concurrent_initialization_serializes_the_first_migration() {
        let (_directory, path) = temporary_database();
        let barrier = Arc::new(Barrier::new(4));
        let threads = (0..4)
            .map(|_| {
                let thread_path = path.clone();
                let thread_barrier = Arc::clone(&barrier);
                thread::spawn(move || {
                    thread_barrier.wait();
                    Database::open(&thread_path)
                })
            })
            .collect::<Vec<_>>();

        for thread in threads {
            let database = thread
                .join()
                .unwrap_or_else(|_| panic!("database initialization thread must complete"));
            drop(must(database));
        }
        let database = must(Database::open(&path));
        assert_eq!(must(database.schema_version()), CURRENT_SCHEMA_VERSION);
    }

    #[test]
    fn concurrent_first_key_creation_is_serialized_across_database_connections() {
        let (_directory, path) = temporary_database();
        let database = must(Database::open(&path));
        must(database.insert_profile(&profile()));
        drop(database);

        let vault = Arc::new(ConcurrentVault {
            key: Mutex::new(None),
            next_fill: AtomicU8::new(21),
        });
        let barrier = Arc::new(Barrier::new(2));
        let workers = (0..2)
            .map(|index| {
                let thread_path = path.clone();
                let thread_vault = Arc::clone(&vault);
                let thread_barrier = Arc::clone(&barrier);
                thread::spawn(move || {
                    let mut database = must(Database::open(&thread_path));
                    thread_barrier.wait();
                    let key = must(database.load_or_create_master_key(thread_vault.as_ref()));
                    must(database.store_encrypted_value(
                        "profile-1",
                        &format!("concurrent-{index}"),
                        &format!("synthetic-{index}"),
                        &key,
                        &SecretBox::new(b"concurrent-synthetic-secret".to_vec().into_boxed_slice()),
                    ));
                    key
                })
            })
            .collect::<Vec<_>>();
        let keys = workers
            .into_iter()
            .map(|worker| {
                worker
                    .join()
                    .unwrap_or_else(|_| panic!("key initialization worker must complete"))
            })
            .collect::<Vec<_>>();

        let database = must(Database::open(&path));
        for index in 0..2 {
            assert_eq!(
                must(database.load_encrypted_value(
                    "profile-1",
                    &format!("concurrent-{index}"),
                    &format!("synthetic-{index}"),
                    &keys[0],
                ))
                .expose_secret(),
                b"concurrent-synthetic-secret"
            );
        }
    }

    #[test]
    fn vault_failure_aborts_persistent_key_access_without_fallback() {
        let (_directory, path) = temporary_database();
        let mut database = must(Database::open(&path));
        assert!(matches!(
            database.load_or_create_master_key(&UnavailableVault),
            Err(StorageError::Vault(VaultError::Unavailable))
        ));
        let reference_count: i64 = must(database.connection.query_row(
            "SELECT COUNT(*) FROM credential_references",
            [],
            |row| row.get(0),
        ));
        assert_eq!(reference_count, 0);

        let other_connection = must(Database::open(&path));
        drop(other_connection);
    }

    #[test]
    fn encrypt_and_reference_insert_roll_back_together_on_sql_failure() {
        let (_directory, path) = temporary_database();
        let mut database = must(Database::open(&path));
        must(database.insert_profile(&profile()));
        must(database.connection.execute_batch(
            "CREATE TRIGGER reject_encrypted_value BEFORE INSERT ON encrypted_values \
             BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END;",
        ));
        let key = test_key(9);

        assert!(matches!(
            database.store_encrypted_value(
                "profile-1",
                "credential-1",
                "talos-client-key",
                &key,
                &SecretBox::new(PLAINTEXT_SENTINEL.to_vec().into_boxed_slice()),
            ),
            Err(StorageError::Database(_))
        ));
        let reference_count: i64 = must(database.connection.query_row(
            "SELECT COUNT(*) FROM credential_references WHERE reference_id = ?1",
            ["credential-1"],
            |row| row.get(0),
        ));
        assert_eq!(reference_count, 0);
        assert!(!contains_plaintext(&path, PLAINTEXT_SENTINEL));
    }

    #[test]
    fn missing_profile_does_not_leave_an_orphan_secret_reference() {
        let (_directory, path) = temporary_database();
        let mut database = must(Database::open(&path));
        let key = test_key(8);
        assert!(matches!(
            database.store_encrypted_value(
                "missing-profile",
                "credential-1",
                "talos-client-key",
                &key,
                &SecretBox::new(PLAINTEXT_SENTINEL.to_vec().into_boxed_slice()),
            ),
            Err(StorageError::Database(_))
        ));
        let reference_count: i64 = must(database.connection.query_row(
            "SELECT COUNT(*) FROM credential_references WHERE reference_id = ?1",
            ["credential-1"],
            |row| row.get(0),
        ));
        assert_eq!(reference_count, 0);
        assert!(!contains_plaintext(&path, PLAINTEXT_SENTINEL));
    }

    #[test]
    fn rejects_wrong_keys_and_tampered_ciphertext() {
        let (_directory, path) = temporary_database();
        let mut database = must(Database::open(&path));
        must(database.insert_profile(&profile()));
        let key = test_key(3);
        must(database.store_encrypted_value(
            "profile-1",
            "credential-1",
            "talos-client-key",
            &key,
            &SecretBox::new(PLAINTEXT_SENTINEL.to_vec().into_boxed_slice()),
        ));

        let wrong_key = test_key(4);
        assert!(matches!(
            database.load_encrypted_value(
                "profile-1",
                "credential-1",
                "talos-client-key",
                &wrong_key,
            ),
            Err(StorageError::Encryption(
                crate::storage::EncryptionError::AuthenticationFailed
            ))
        ));

        let mut ciphertext: Vec<u8> = must(database.connection.query_row(
            "SELECT ciphertext FROM encrypted_values WHERE reference_id = ?1",
            ["credential-1"],
            |row| row.get(0),
        ));
        ciphertext[0] ^= 0x01;
        must(database.connection.execute(
            "UPDATE encrypted_values SET ciphertext = ?1 WHERE reference_id = ?2",
            rusqlite::params![ciphertext, "credential-1"],
        ));
        assert!(matches!(
            database.load_encrypted_value("profile-1", "credential-1", "talos-client-key", &key,),
            Err(StorageError::Encryption(
                crate::storage::EncryptionError::AuthenticationFailed
            ))
        ));
        assert!(!contains_plaintext(&path, PLAINTEXT_SENTINEL));
    }

    #[test]
    fn rejects_unknown_future_schema_version() {
        let (_directory, path) = temporary_database();
        let connection = must(Connection::open(&path));
        must(connection.pragma_update(None, "user_version", 99));
        drop(connection);

        assert!(matches!(
            Database::open(&path),
            Err(StorageError::UnsupportedSchema)
        ));
    }

    #[test]
    fn rejects_oversize_values_before_writing_a_reference() {
        let (_directory, path) = temporary_database();
        let mut database = must(Database::open(&path));
        must(database.insert_profile(&profile()));
        let key = test_key(5);
        let too_large = SecretBox::new(vec![b'x'; MAX_SECRET_BYTES + 1].into_boxed_slice());

        assert!(matches!(
            database.store_encrypted_value(
                "profile-1",
                "credential-1",
                "talos-client-key",
                &key,
                &too_large,
            ),
            Err(StorageError::Encryption(
                crate::storage::EncryptionError::TooLarge
            ))
        ));
        let reference_count: i64 = must(database.connection.query_row(
            "SELECT COUNT(*) FROM credential_references WHERE reference_id = ?1",
            ["credential-1"],
            |row| row.get(0),
        ));
        assert_eq!(reference_count, 0);
    }
}
