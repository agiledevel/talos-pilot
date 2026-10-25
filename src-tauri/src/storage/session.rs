//! Explicit in-memory credential storage for session-only operation.

use std::collections::HashMap;
use std::sync::Mutex;

use secrecy::{ExposeSecret, SecretBox};

use super::database::{MAX_IDENTIFIER_BYTES, MAX_SECRET_BYTES, bounded_label};

const MAX_SESSION_CREDENTIALS: usize = 256;
const MAX_SESSION_BYTES: usize = 64 * 1024 * 1024;

/// Safe errors from the in-memory session-only credential store.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum SessionStoreError {
    /// An identifier or secret exceeds the local storage bound.
    #[error("session credential exceeds the storage bound")]
    TooLarge,
    /// The reference is empty or otherwise invalid.
    #[error("session credential identity is invalid")]
    InvalidIdentity,
    /// The reference's label is missing, empty, or out of bounds.
    #[error("session credential label is invalid")]
    InvalidLabel,
    /// The in-memory store lock became poisoned after a panic.
    #[error("session credential store is unavailable")]
    Unavailable,
}

/// Holds credentials only in zeroizing process memory for explicit
/// session-only operation.
///
/// Construct this store only after the user chooses session-only operation
/// when the OS vault is unavailable, or when the import cannot be persisted.
/// It has no database handle and provides no serialization or persistence
/// path. Dropping it releases its retained values, and each value is zeroized
/// by `SecretBox`.
///
/// Each credential carries a bounded context label in memory only. The label
/// is what an explicit credential listing shows for this entry; it is never
/// written to the database, so a session-only import leaves no plaintext
/// label behind and disappears with this store.
pub struct SessionOnlyStore {
    values: Mutex<SessionValues>,
}

struct SessionValues {
    credentials: HashMap<String, SessionCredential>,
    total_bytes: usize,
}

struct SessionCredential {
    label: String,
    secret: SecretBox<[u8]>,
}

impl SessionOnlyStore {
    /// Creates an empty, explicitly session-only credential store.
    #[must_use]
    pub fn new() -> Self {
        Self {
            values: Mutex::new(SessionValues {
                credentials: HashMap::new(),
                total_bytes: 0,
            }),
        }
    }

    /// Inserts or replaces one bounded secret and its bounded label in memory.
    ///
    /// # Errors
    ///
    /// Returns a safe error for invalid identities, invalid labels, oversized
    /// values, or a poisoned internal lock. The supplied secret is dropped on
    /// error.
    pub fn insert(
        &self,
        reference_id: &str,
        label: &str,
        secret: SecretBox<[u8]>,
    ) -> Result<(), SessionStoreError> {
        if reference_id.is_empty() {
            return Err(SessionStoreError::InvalidIdentity);
        }
        if !bounded_label(label) {
            return Err(SessionStoreError::InvalidLabel);
        }
        if reference_id.len() > MAX_IDENTIFIER_BYTES
            || secret.expose_secret().len() > MAX_SECRET_BYTES
        {
            return Err(SessionStoreError::TooLarge);
        }
        let mut values = self
            .values
            .lock()
            .map_err(|_| SessionStoreError::Unavailable)?;
        let existing_size = values
            .credentials
            .get(reference_id)
            .map_or(0, |current| current.secret.expose_secret().len());
        if !values.credentials.contains_key(reference_id)
            && values.credentials.len() >= MAX_SESSION_CREDENTIALS
        {
            return Err(SessionStoreError::TooLarge);
        }
        let new_total = values
            .total_bytes
            .checked_sub(existing_size)
            .and_then(|size| size.checked_add(secret.expose_secret().len()))
            .ok_or(SessionStoreError::TooLarge)?;
        if new_total > MAX_SESSION_BYTES {
            return Err(SessionStoreError::TooLarge);
        }
        values.credentials.insert(
            reference_id.to_owned(),
            SessionCredential {
                label: label.to_owned(),
                secret,
            },
        );
        values.total_bytes = new_total;
        Ok(())
    }

    /// Borrows a secret only for the duration of `use_secret`.
    ///
    /// The closure should pass the bytes directly to a backend operation and
    /// should not copy or retain them. It runs while the store lock is held,
    /// so it must not call back into this store. `None` means the reference is
    /// absent.
    ///
    /// # Errors
    ///
    /// Returns a safe error if the internal lock is poisoned.
    pub fn with_secret<R>(
        &self,
        reference_id: &str,
        use_secret: impl FnOnce(&[u8]) -> R,
    ) -> Result<Option<R>, SessionStoreError> {
        let values = self
            .values
            .lock()
            .map_err(|_| SessionStoreError::Unavailable)?;
        Ok(values
            .credentials
            .get(reference_id)
            .map(|credential| use_secret(credential.secret.expose_secret())))
    }

    /// Borrows a credential's bounded context label.
    ///
    /// # Errors
    ///
    /// Returns a safe error if the internal lock is poisoned.
    pub fn with_label<R>(
        &self,
        reference_id: &str,
        use_label: impl FnOnce(&str) -> R,
    ) -> Result<Option<R>, SessionStoreError> {
        let values = self
            .values
            .lock()
            .map_err(|_| SessionStoreError::Unavailable)?;
        Ok(values
            .credentials
            .get(reference_id)
            .map(|credential| use_label(&credential.label)))
    }

    /// Lists this store's references and labels in a bounded projection.
    ///
    /// References are returned in identifier order so a listing is stable
    /// between calls. The store's own bounds already cap the entry count.
    ///
    /// # Errors
    ///
    /// Returns a safe error if the internal lock is poisoned.
    pub fn list(&self) -> Result<Vec<(String, String)>, SessionStoreError> {
        let values = self
            .values
            .lock()
            .map_err(|_| SessionStoreError::Unavailable)?;
        let mut entries = values
            .credentials
            .iter()
            .map(|(reference_id, credential)| (reference_id.clone(), credential.label.clone()))
            .collect::<Vec<_>>();
        entries.sort();
        Ok(entries)
    }

    /// Removes a secret from this session, zeroizing it when no owner remains.
    ///
    /// # Errors
    ///
    /// Returns a safe error if the internal lock is poisoned.
    pub fn remove(&self, reference_id: &str) -> Result<bool, SessionStoreError> {
        let mut values = self
            .values
            .lock()
            .map_err(|_| SessionStoreError::Unavailable)?;
        if let Some(credential) = values.credentials.remove(reference_id) {
            values.total_bytes = values
                .total_bytes
                .checked_sub(credential.secret.expose_secret().len())
                .ok_or(SessionStoreError::Unavailable)?;
            drop(credential);
            Ok(true)
        } else {
            Ok(false)
        }
    }

    #[cfg(test)]
    pub(super) fn credential_count(&self) -> Result<usize, SessionStoreError> {
        self.values
            .lock()
            .map(|values| values.credentials.len())
            .map_err(|_| SessionStoreError::Unavailable)
    }
}

impl Default for SessionOnlyStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use secrecy::SecretBox;

    use super::{SessionOnlyStore, SessionStoreError};

    #[test]
    fn holds_values_only_in_this_store_and_removes_them() {
        let store = SessionOnlyStore::new();
        let secret = SecretBox::new(b"session-only-synthetic".to_vec().into_boxed_slice());
        store
            .insert("reference", "synthetic context", secret)
            .unwrap_or_else(|_| panic!("bounded secret should be accepted"));
        assert_eq!(
            store
                .with_secret("reference", |bytes| bytes.to_vec())
                .unwrap_or_else(|_| panic!("store should remain available")),
            Some(b"session-only-synthetic".to_vec())
        );
        assert_eq!(
            store
                .with_label("reference", str::to_owned)
                .unwrap_or_else(|_| panic!("store should remain available")),
            Some("synthetic context".to_owned())
        );
        assert_eq!(
            store
                .list()
                .unwrap_or_else(|_| panic!("store should remain available")),
            vec![("reference".to_owned(), "synthetic context".to_owned())]
        );
        assert!(
            store
                .remove("reference")
                .unwrap_or_else(|_| panic!("store should remain available"))
        );
        assert_eq!(
            store
                .with_secret("reference", |bytes| bytes.len())
                .unwrap_or_else(|_| panic!("store should remain available")),
            None
        );
    }

    #[test]
    fn rejects_invalid_labels_and_oversized_session_values() {
        let store = SessionOnlyStore::new();
        assert_eq!(
            store.insert(
                "",
                "synthetic",
                SecretBox::new(Vec::new().into_boxed_slice())
            ),
            Err(SessionStoreError::InvalidIdentity)
        );
        assert_eq!(
            store.insert(
                "reference",
                "",
                SecretBox::new(Vec::new().into_boxed_slice())
            ),
            Err(SessionStoreError::InvalidLabel)
        );
        assert_eq!(
            store.insert(
                "reference",
                "unsafe\nlabel",
                SecretBox::new(Vec::new().into_boxed_slice())
            ),
            Err(SessionStoreError::InvalidLabel)
        );
        assert_eq!(
            store.insert(
                "x".repeat(129).as_str(),
                "synthetic",
                SecretBox::new(Box::new([0_u8]))
            ),
            Err(SessionStoreError::TooLarge)
        );
    }

    #[test]
    fn bounds_the_number_of_retained_credentials() {
        let store = SessionOnlyStore::new();
        for index in 0..256 {
            store
                .insert(
                    &format!("reference-{index}"),
                    &format!("context-{index}"),
                    SecretBox::new(vec![1_u8].into_boxed_slice()),
                )
                .unwrap_or_else(|_| panic!("session count should remain within its bound"));
        }
        assert_eq!(
            store.insert(
                "reference-overflow",
                "overflow",
                SecretBox::new(vec![1_u8].into_boxed_slice())
            ),
            Err(SessionStoreError::TooLarge)
        );
    }
}
