//! Versioned AEAD envelopes for sensitive values stored in SQLite.

use chacha20poly1305::{
    KeyInit, XChaCha20Poly1305, XNonce,
    aead::{Aead, Payload},
};
use secrecy::{ExposeSecret, SecretBox};

use super::database::{MAX_IDENTIFIER_BYTES, MAX_SECRET_BYTES};

const ENVELOPE_VERSION: u8 = 1;
const NONCE_BYTES: usize = 24;
const AUTH_TAG_BYTES: usize = 16;
const AAD_DOMAIN: &[u8] = b"talos-pilot/sqlite-value/v1\0";

/// A non-copyable master key whose underlying bytes are zeroized when dropped.
///
/// This type has no serialization or revealing `Debug` implementation. The
/// vault adapter added in C3.2 supplies production keys; C3.1 uses injected
/// keys only in internal storage tests.
pub struct EncryptionKey(SecretBox<[u8; 32]>);

impl EncryptionKey {
    /// Takes ownership of a key supplied by a platform-backed key provider.
    ///
    /// Callers cannot retrieve the bytes through this type; the container
    /// zeroizes its allocation when dropped.
    pub fn from_secret(secret: SecretBox<[u8; 32]>) -> Self {
        Self(secret)
    }

    pub(crate) fn expose_to_vault(&self) -> &[u8; 32] {
        self.0.expose_secret()
    }
}

/// Ciphertext plus independently versioned nonce and envelope metadata.
#[derive(Clone, Eq, PartialEq)]
pub(crate) struct EncryptedEnvelope {
    pub(crate) version: u8,
    pub(crate) nonce: Vec<u8>,
    pub(crate) ciphertext: Vec<u8>,
}

/// Safe failures from encryption, envelope parsing, or authentication.
///
/// Display messages contain no key, plaintext, or ciphertext content.
#[derive(Debug, thiserror::Error, Eq, PartialEq)]
pub enum EncryptionError {
    /// The secret or its associated identity exceeded the storage bound.
    #[error("encrypted value exceeds the storage bound")]
    TooLarge,
    /// A required associated-data identifier is empty or malformed.
    #[error("encrypted value identity is invalid")]
    InvalidIdentity,
    /// The envelope version, nonce, or ciphertext layout is unsupported.
    #[error("encrypted value envelope is invalid")]
    InvalidEnvelope,
    /// The operating system could not provide cryptographic randomness.
    #[error("secure random bytes are unavailable")]
    RandomUnavailable,
    /// The supplied key cannot initialize the selected cipher.
    #[error("encryption key is invalid")]
    InvalidKey,
    /// Ciphertext authentication failed for this key or associated identity.
    #[error("encrypted value authentication failed")]
    AuthenticationFailed,
}

/// Encrypts a bounded secret with a random XChaCha20-Poly1305 nonce.
///
/// Associated data binds the ciphertext to its profile, reference, and value
/// kind, preventing a valid envelope from being moved to a different record.
pub(crate) fn encrypt(
    key: &EncryptionKey,
    profile_id: &str,
    reference_id: &str,
    kind: &str,
    plaintext: &SecretBox<[u8]>,
) -> Result<EncryptedEnvelope, EncryptionError> {
    encrypt_with_nonce_source(key, profile_id, reference_id, kind, plaintext, |nonce| {
        getrandom::fill(nonce).map_err(|_| ())
    })
}

fn encrypt_with_nonce_source(
    key: &EncryptionKey,
    profile_id: &str,
    reference_id: &str,
    kind: &str,
    plaintext: &SecretBox<[u8]>,
    fill_nonce: impl FnOnce(&mut [u8]) -> Result<(), ()>,
) -> Result<EncryptedEnvelope, EncryptionError> {
    let plaintext = plaintext.expose_secret();
    if plaintext.len() > MAX_SECRET_BYTES {
        return Err(EncryptionError::TooLarge);
    }
    let aad = associated_data(profile_id, reference_id, kind)?;
    let cipher = cipher(key)?;
    let mut nonce_bytes = [0_u8; NONCE_BYTES];
    fill_nonce(&mut nonce_bytes).map_err(|_| EncryptionError::RandomUnavailable)?;
    let nonce = XNonce::from(nonce_bytes);
    let ciphertext = cipher
        .encrypt(
            &nonce,
            Payload {
                msg: plaintext,
                aad: &aad,
            },
        )
        .map_err(|_| EncryptionError::AuthenticationFailed)?;

    Ok(EncryptedEnvelope {
        version: ENVELOPE_VERSION,
        nonce: nonce.to_vec(),
        ciphertext,
    })
}

/// Authenticates and decrypts a stored envelope into zeroizing memory.
pub(crate) fn decrypt(
    key: &EncryptionKey,
    profile_id: &str,
    reference_id: &str,
    kind: &str,
    envelope: &EncryptedEnvelope,
) -> Result<SecretBox<[u8]>, EncryptionError> {
    if envelope.version != ENVELOPE_VERSION
        || envelope.nonce.len() != NONCE_BYTES
        || envelope.ciphertext.len() < AUTH_TAG_BYTES
    {
        return Err(EncryptionError::InvalidEnvelope);
    }
    if envelope.ciphertext.len() > MAX_SECRET_BYTES + AUTH_TAG_BYTES {
        return Err(EncryptionError::TooLarge);
    }

    let aad = associated_data(profile_id, reference_id, kind)?;
    let cipher = cipher(key)?;
    let nonce_bytes: [u8; NONCE_BYTES] = envelope
        .nonce
        .as_slice()
        .try_into()
        .map_err(|_| EncryptionError::InvalidEnvelope)?;
    let nonce = XNonce::from(nonce_bytes);
    let plaintext = cipher
        .decrypt(
            &nonce,
            Payload {
                msg: envelope.ciphertext.as_slice(),
                aad: &aad,
            },
        )
        .map_err(|_| EncryptionError::AuthenticationFailed)?;
    Ok(SecretBox::new(plaintext.into_boxed_slice()))
}

fn cipher(key: &EncryptionKey) -> Result<XChaCha20Poly1305, EncryptionError> {
    XChaCha20Poly1305::new_from_slice(key.0.expose_secret().as_slice())
        .map_err(|_| EncryptionError::InvalidKey)
}

fn associated_data(
    profile_id: &str,
    reference_id: &str,
    kind: &str,
) -> Result<Vec<u8>, EncryptionError> {
    for identifier in [profile_id, reference_id, kind] {
        if identifier.is_empty() {
            return Err(EncryptionError::InvalidIdentity);
        }
        if identifier.len() > MAX_IDENTIFIER_BYTES {
            return Err(EncryptionError::TooLarge);
        }
    }

    let fields = [
        profile_id.as_bytes(),
        reference_id.as_bytes(),
        kind.as_bytes(),
    ];
    let mut aad = Vec::with_capacity(
        AAD_DOMAIN.len() + fields.iter().map(|field| field.len() + 4).sum::<usize>(),
    );
    aad.extend_from_slice(AAD_DOMAIN);
    for field in fields {
        let length = u32::try_from(field.len()).map_err(|_| EncryptionError::TooLarge)?;
        aad.extend_from_slice(&length.to_be_bytes());
        aad.extend_from_slice(field);
    }
    Ok(aad)
}

#[cfg(test)]
mod tests {
    use secrecy::{ExposeSecret, SecretBox};

    use super::{EncryptionError, EncryptionKey, decrypt, encrypt};
    use crate::storage::database::MAX_SECRET_BYTES;

    const PROFILE_ID: &str = "profile-a";
    const REFERENCE_ID: &str = "reference-a";
    const VALUE_KIND: &str = "talos-client-key";

    fn test_key(fill: u8) -> EncryptionKey {
        EncryptionKey::from_secret(SecretBox::new(Box::new([fill; 32])))
    }

    #[test]
    fn encrypts_and_decrypts_with_bound_record_identity() {
        let key = test_key(7);
        let plaintext = SecretBox::new(
            b"synthetic encrypted credential"
                .to_vec()
                .into_boxed_slice(),
        );
        let envelope = encrypt(&key, PROFILE_ID, REFERENCE_ID, VALUE_KIND, &plaintext)
            .unwrap_or_else(|_| panic!("valid secret should encrypt"));
        let recovered = decrypt(&key, PROFILE_ID, REFERENCE_ID, VALUE_KIND, &envelope)
            .unwrap_or_else(|_| panic!("the matching identity should authenticate"));

        assert_eq!(recovered.expose_secret(), plaintext.expose_secret());
        assert_eq!(envelope.version, 1);
        assert_eq!(envelope.nonce.len(), 24);
        assert_ne!(envelope.ciphertext, plaintext.expose_secret());
    }

    #[test]
    fn rejects_wrong_key_and_swapped_associated_identity() {
        let key = test_key(2);
        let wrong_key = test_key(3);
        let plaintext = SecretBox::new(b"synthetic secret".to_vec().into_boxed_slice());
        let envelope = encrypt(&key, PROFILE_ID, REFERENCE_ID, VALUE_KIND, &plaintext)
            .unwrap_or_else(|_| panic!("valid secret should encrypt"));

        assert_eq!(
            decrypt(&wrong_key, PROFILE_ID, REFERENCE_ID, VALUE_KIND, &envelope).err(),
            Some(EncryptionError::AuthenticationFailed)
        );
        assert_eq!(
            decrypt(&key, "profile-b", REFERENCE_ID, VALUE_KIND, &envelope).err(),
            Some(EncryptionError::AuthenticationFailed)
        );
        assert_eq!(
            decrypt(&key, PROFILE_ID, REFERENCE_ID, "kubeconfig", &envelope).err(),
            Some(EncryptionError::AuthenticationFailed)
        );
    }

    #[test]
    fn rejects_corrupt_nonce_ciphertext_and_unknown_envelope_version() {
        let key = test_key(4);
        let plaintext = SecretBox::new(b"synthetic secret".to_vec().into_boxed_slice());
        let envelope = encrypt(&key, PROFILE_ID, REFERENCE_ID, VALUE_KIND, &plaintext)
            .unwrap_or_else(|_| panic!("valid secret should encrypt"));

        let mut corrupt_nonce = envelope.clone();
        corrupt_nonce.nonce[0] ^= 1;
        assert_eq!(
            decrypt(&key, PROFILE_ID, REFERENCE_ID, VALUE_KIND, &corrupt_nonce).err(),
            Some(EncryptionError::AuthenticationFailed)
        );

        let mut corrupt_ciphertext = envelope.clone();
        corrupt_ciphertext.ciphertext[0] ^= 1;
        assert_eq!(
            decrypt(
                &key,
                PROFILE_ID,
                REFERENCE_ID,
                VALUE_KIND,
                &corrupt_ciphertext
            )
            .err(),
            Some(EncryptionError::AuthenticationFailed)
        );

        let mut unknown_version = envelope.clone();
        unknown_version.version = 2;
        assert_eq!(
            decrypt(&key, PROFILE_ID, REFERENCE_ID, VALUE_KIND, &unknown_version).err(),
            Some(EncryptionError::InvalidEnvelope)
        );

        let mut truncated_nonce = envelope.clone();
        truncated_nonce.nonce.pop();
        assert_eq!(
            decrypt(&key, PROFILE_ID, REFERENCE_ID, VALUE_KIND, &truncated_nonce).err(),
            Some(EncryptionError::InvalidEnvelope)
        );

        let mut truncated_ciphertext = envelope;
        truncated_ciphertext.ciphertext.clear();
        assert_eq!(
            decrypt(
                &key,
                PROFILE_ID,
                REFERENCE_ID,
                VALUE_KIND,
                &truncated_ciphertext
            )
            .err(),
            Some(EncryptionError::InvalidEnvelope)
        );
    }

    #[test]
    fn rejects_oversize_plaintext_and_invalid_identity() {
        let key = test_key(6);
        let too_large = SecretBox::new(vec![0; MAX_SECRET_BYTES + 1].into_boxed_slice());
        assert_eq!(
            encrypt(&key, PROFILE_ID, REFERENCE_ID, VALUE_KIND, &too_large).err(),
            Some(EncryptionError::TooLarge)
        );

        let plaintext = SecretBox::new(b"small".to_vec().into_boxed_slice());
        assert_eq!(
            encrypt(&key, "", REFERENCE_ID, VALUE_KIND, &plaintext).err(),
            Some(EncryptionError::InvalidIdentity)
        );
    }

    #[test]
    fn reports_random_source_failure_without_writing_an_envelope() {
        let key = test_key(10);
        let plaintext = SecretBox::new(b"synthetic secret".to_vec().into_boxed_slice());
        assert_eq!(
            super::encrypt_with_nonce_source(
                &key,
                PROFILE_ID,
                REFERENCE_ID,
                VALUE_KIND,
                &plaintext,
                |_| Err(()),
            )
            .err(),
            Some(EncryptionError::RandomUnavailable)
        );
    }
}
