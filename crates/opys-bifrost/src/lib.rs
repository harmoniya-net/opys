//! Mint a [Bifrost](https://gitlab.com/harmoniya/bifrost)-compatible JWT
//! locally, so a launch can run against a self-hosted Yggdrasil server
//! without going through the OAuth `/token` flow.
//!
//! Bifrost validates a bearer token with a single Ed25519 public key and
//! requires two claims, `uuid` and `username`. This signs with the matching
//! private key — same algorithm (`EdDSA`) and the same payload as Bifrost's
//! own `/token` endpoint: `{ uuid, username, iat, exp }`.
//!
//! Nothing here touches the network or the manifest: it is a pure function
//! of its options, and the only opys crate that depends on no other.

use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use ed25519_dalek::pkcs8::spki::ObjectIdentifier;
use ed25519_dalek::pkcs8::{DecodePrivateKey, PrivateKeyInfo, SecretDocument};
use ed25519_dalek::{Signer, SigningKey};
use serde::{Deserialize, Serialize};

/// 24 hours — what Bifrost's own `/token` issues.
pub const DEFAULT_TTL_SECONDS: u64 = 24 * 60 * 60;

const ED25519: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.3.101.112");

#[derive(Debug, thiserror::Error)]
pub enum BifrostError {
    #[error(
        "bifrost: privateKey is required (got empty/undefined). Set BIFROST_PRIVATE_KEY in your \
         environment, e.g. `export BIFROST_PRIVATE_KEY=\"$(cat path/to/key.pem)\"`."
    )]
    NoKey,
    #[error("Bifrost private key must be Ed25519; got a key of algorithm {oid}")]
    NotEd25519 { oid: String },
    #[error("Bifrost private key is not a PKCS#8 PEM: {0}")]
    Key(String),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BifrostOptions {
    /// PEM-encoded Ed25519 private key (PKCS#8). A single-line key with
    /// literal `\n` separators is accepted, which is what survives an
    /// environment variable; a missing `-----BEGIN PRIVATE KEY-----` armour is
    /// added.
    pub private_key: String,
    /// The `username` claim, mirrored into the result.
    pub username: String,
    /// Player UUID. Dashes are stripped and it is lowercased before signing,
    /// as Bifrost does.
    pub uuid: String,
    /// Token lifetime in seconds. `None` is [`DEFAULT_TTL_SECONDS`]; `0`
    /// omits `exp` entirely.
    #[serde(default, deserialize_with = "whole")]
    pub expires_in: Option<u64>,
    /// Issued-at, in milliseconds since the epoch. `None` is now.
    #[serde(default, deserialize_with = "whole")]
    pub now: Option<u64>,
}

/// A count that may arrive as a float. JavaScript has one number type, and a
/// millisecond timestamp is past where it is handed over as an integer, so
/// `1704067200000.0` is what a caller there sends. It is floored; a negative
/// or non-finite one is refused.
fn whole<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Option<u64>, D::Error> {
    let Some(number) = Option::<f64>::deserialize(deserializer)? else {
        return Ok(None);
    };
    if number.is_finite() && number >= 0.0 {
        Ok(Some(number.floor() as u64))
    } else {
        Err(serde::de::Error::custom(format!(
            "expected a whole, non-negative number, got {number}"
        )))
    }
}

/// What a launch needs: spread it into the vars the manifest reads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct BifrostAuth {
    pub username: String,
    /// Dashless, lowercase UUID.
    pub uuid: String,
    /// The signed JWT.
    pub token: String,
}

/// The key, however it was pasted: escaped newlines made real, and the PEM
/// armour added if only the body was given.
fn pem_of(raw: &str) -> Result<String, BifrostError> {
    let unescaped = raw.replace("\\n", "\n");
    let trimmed = unescaped.trim();
    if trimmed.is_empty() {
        return Err(BifrostError::NoKey);
    }
    Ok(if trimmed.contains("-----BEGIN ") {
        trimmed.to_owned()
    } else {
        format!("-----BEGIN PRIVATE KEY-----\n{trimmed}\n-----END PRIVATE KEY-----")
    })
}

fn signing_key(raw: &str) -> Result<SigningKey, BifrostError> {
    let pem = pem_of(raw)?;
    SigningKey::from_pkcs8_pem(&pem).map_err(|error| {
        // A well-formed key of another algorithm is the mistake worth naming:
        // an RSA key pasted where an Ed25519 one belongs.
        let other = SecretDocument::from_pem(&pem)
            .ok()
            .and_then(|(_, document)| {
                let info = PrivateKeyInfo::try_from(document.as_bytes()).ok()?;
                (info.algorithm.oid != ED25519).then(|| info.algorithm.oid.to_string())
            });
        match other {
            Some(oid) => BifrostError::NotEd25519 { oid },
            None => BifrostError::Key(error.to_string()),
        }
    })
}

fn base64url(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// The claims, in the order Bifrost writes them. A struct rather than a map
/// so that order is the declaration's and not a hasher's.
#[derive(Serialize)]
struct Claims<'a> {
    uuid: &'a str,
    username: &'a str,
    iat: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    exp: Option<u64>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or_default()
}

/// Sign an Ed25519 JWT with `{ uuid, username, iat, exp }` claims.
///
/// The token is what Bifrost's `/token` would have minted for the same
/// inputs, so it passes validation against the matching public key. Ed25519
/// signatures are deterministic: the same options give the same token.
pub fn mint_bifrost(options: &BifrostOptions) -> Result<BifrostAuth, BifrostError> {
    let key = signing_key(&options.private_key)?;
    let uuid = options.uuid.replace('-', "").to_lowercase();

    let iat = options.now.unwrap_or_else(now_ms) / 1000;
    let ttl = options.expires_in.unwrap_or(DEFAULT_TTL_SECONDS);
    let claims = Claims {
        uuid: &uuid,
        username: &options.username,
        iat,
        exp: (ttl > 0).then(|| iat + ttl),
    };

    let header = base64url(br#"{"alg":"EdDSA","typ":"JWT"}"#);
    // Serialising a struct of strings and integers cannot fail.
    let payload = base64url(&serde_json::to_vec(&claims).expect("claims serialise"));
    let signing_input = format!("{header}.{payload}");
    let signature = key.sign(signing_input.as_bytes());

    Ok(BifrostAuth {
        username: options.username.clone(),
        uuid,
        token: format!("{signing_input}.{}", base64url(&signature.to_bytes())),
    })
}
