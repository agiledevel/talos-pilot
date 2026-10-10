//! Zeroizing holders and validators for credential material parsed from configs.

use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Deserialize;
use zeroize::Zeroizing;

/// A parsed configuration string that is wiped from memory on drop.
///
/// It deliberately implements neither `Debug` nor `Display`, so the value
/// cannot reach logs or error text by formatting.
pub(crate) struct SensitiveString(Zeroizing<String>);

impl SensitiveString {
    /// Borrows the secret value; callers must not copy or log it.
    pub(crate) fn expose(&self) -> &str {
        &self.0
    }

    /// Reports whether the value is the empty string.
    pub(crate) fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl<'de> Deserialize<'de> for SensitiveString {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        String::deserialize(deserializer).map(|value| Self(Zeroizing::new(value)))
    }
}

/// Reports whether `value` is standard base64 that decodes to non-empty bytes.
///
/// The decoded bytes are held in zeroizing memory and dropped immediately, so
/// a file path reference is rejected without retaining certificate or key data.
pub(crate) fn decodes_to_nonempty_base64(value: &str) -> bool {
    let decoded = match STANDARD.decode(value) {
        Ok(decoded) => Zeroizing::new(decoded),
        Err(_) => return false,
    };
    !decoded.is_empty()
}

#[cfg(test)]
mod tests {
    use super::{SensitiveString, decodes_to_nonempty_base64};

    #[test]
    fn accepts_only_nonempty_inline_base64() {
        assert!(decodes_to_nonempty_base64("c3ludGhldGljLWNh"));
        assert!(!decodes_to_nonempty_base64(""));
        assert!(!decodes_to_nonempty_base64("/home/operator/ca.crt"));
    }

    #[test]
    fn deserialized_value_round_trips_through_expose() {
        let value: SensitiveString = serde_json::from_str("\"synthetic\"")
            .unwrap_or_else(|_| panic!("a JSON string must deserialize"));
        assert_eq!(value.expose(), "synthetic");
        assert!(!value.is_empty());
        let empty: SensitiveString = serde_json::from_str("\"\"")
            .unwrap_or_else(|_| panic!("an empty JSON string must deserialize"));
        assert!(empty.is_empty());
    }
}
