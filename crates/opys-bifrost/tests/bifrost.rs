//! The token is checked two ways: against what the TypeScript implementation
//! this replaced produced for the same inputs, byte for byte, and by
//! verifying it with the public key as Bifrost would.

use base64::Engine;
use ed25519_dalek::pkcs8::DecodePrivateKey;
use ed25519_dalek::{Signature, SigningKey, Verifier};
use opys_bifrost::{mint_bifrost, BifrostAuth, BifrostError, BifrostOptions, DEFAULT_TTL_SECONDS};
use serde_json::{json, Value};

const KEY: &str = "-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIJ+DYvh6SEqVTm50DFtMDoQikTmiCqirVv9mWG9qfSnF
-----END PRIVATE KEY-----";
const BODY: &str = "MC4CAQAwBQYDK2VwBCIEIJ+DYvh6SEqVTm50DFtMDoQikTmiCqirVv9mWG9qfSnF";

/// 2024-01-01T00:00:00Z, in milliseconds.
const NOW: u64 = 1_704_067_200_000;

fn options(extra: Value) -> BifrostOptions {
    let mut base = json!({ "privateKey": KEY, "username": "Player", "uuid": "00", "now": NOW });
    base.as_object_mut()
        .unwrap()
        .extend(extra.as_object().unwrap().clone());
    serde_json::from_value(base).unwrap()
}

fn mint(extra: Value) -> BifrostAuth {
    mint_bifrost(&options(extra)).unwrap()
}

fn segment(token: &str, index: usize) -> Value {
    let part = token.split('.').nth(index).unwrap();
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(part)
        .unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

// ── against the implementation it replaced ────────────────────────────────

#[test]
fn the_token_is_the_one_the_typescript_implementation_minted() {
    let auth = mint(json!({
        "username": "Stéve \"q\"",
        "uuid": "AAAAAAAA-0000-1111-2222-333333333333",
        "now": NOW + 123,
        "expiresIn": 3600,
    }));
    assert_eq!(
        auth.token,
        "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJ1dWlkIjoiYWFhYWFhYWEwMDAwMTExMTIyMjIzMzMzMzMzMzMzMzMiLCJ1c2VybmFtZSI6IlN0w6l2ZSBcInFcIiIsImlhdCI6MTcwNDA2NzIwMCwiZXhwIjoxNzA0MDcwODAwfQ.PcpXlWFDjp8MIl0lxSlejXaWXCsP2oYZHpy19drfgqB9tMxWe7jUkf6eT3U3FIBg-_-ocEQ91N_m-2VbEIFGCA"
    );
}

#[test]
fn and_so_is_the_one_with_no_expiry() {
    assert_eq!(
        mint(json!({ "expiresIn": 0 })).token,
        "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJ1dWlkIjoiMDAiLCJ1c2VybmFtZSI6IlBsYXllciIsImlhdCI6MTcwNDA2NzIwMH0.gSWopmrCRCNkDPXMRW67tFreL8XQyU8OfwQSeIjrgZ6o237EXv3KIoUFCMICvNfPZ5fd6oJZ8_8QQbMlZGHkDQ"
    );
}

// ── the token ─────────────────────────────────────────────────────────────

#[test]
fn the_header_is_eddsa_and_the_claims_are_bifrosts() {
    let auth = mint(json!({ "uuid": "11111111-1111-1111-1111-111111111111", "expiresIn": 3600 }));
    assert_eq!(auth.token.split('.').count(), 3);
    assert_eq!(
        segment(&auth.token, 0),
        json!({ "alg": "EdDSA", "typ": "JWT" })
    );
    assert_eq!(
        segment(&auth.token, 1),
        json!({
            "uuid": "11111111111111111111111111111111",
            "username": "Player",
            "iat": NOW / 1000,
            "exp": NOW / 1000 + 3600,
        })
    );
}

#[test]
fn the_signature_verifies_with_the_matching_public_key() {
    let auth = mint(json!({}));
    let (signed, signature) = auth.token.rsplit_once('.').unwrap();
    let signature = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(signature)
        .unwrap();
    let public = SigningKey::from_pkcs8_pem(KEY).unwrap().verifying_key();
    public
        .verify(
            signed.as_bytes(),
            &Signature::from_slice(&signature).unwrap(),
        )
        .unwrap();
}

#[test]
fn the_username_is_mirrored_and_the_uuid_is_dashless_and_lowercase() {
    let auth = mint(json!({ "username": "Steve", "uuid": "AAAA-BBBB-cccc" }));
    assert_eq!(
        (auth.username.as_str(), auth.uuid.as_str()),
        ("Steve", "aaaabbbbcccc")
    );
}

#[test]
fn a_token_lives_a_day_unless_told_otherwise_and_forever_at_zero() {
    let default = segment(&mint(json!({})).token, 1);
    assert_eq!(default["exp"], json!(NOW / 1000 + DEFAULT_TTL_SECONDS));
    assert_eq!(DEFAULT_TTL_SECONDS, 86_400);
    assert!(segment(&mint(json!({ "expiresIn": 0 })).token, 1)
        .get("exp")
        .is_none());
}

#[test]
fn issued_at_is_whole_seconds_and_defaults_to_now() {
    assert_eq!(
        segment(&mint(json!({ "now": NOW + 999 })).token, 1)["iat"],
        json!(NOW / 1000)
    );

    let mut live = options(json!({}));
    live.now = None;
    let before = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let iat = segment(&mint_bifrost(&live).unwrap().token, 1)["iat"]
        .as_u64()
        .unwrap();
    assert!(
        (before..=before + 5).contains(&iat),
        "{iat} is not about {before}"
    );
}

#[test]
fn the_same_options_mint_the_same_token() {
    assert_eq!(mint(json!({})), mint(json!({})));
}

// ── the key, however it was pasted ────────────────────────────────────────

#[test]
fn a_key_with_escaped_newlines_or_without_its_armour_is_the_same_key() {
    let expected = mint(json!({})).token;
    let one_line = KEY.replace('\n', "\\n");
    assert!(!one_line.contains('\n'));
    for key in [one_line.as_str(), BODY, &format!("  \n{KEY}\n\n")] {
        assert_eq!(
            mint(json!({ "privateKey": key })).token,
            expected,
            "{key:?}"
        );
    }
}

#[test]
fn a_missing_key_says_where_one_comes_from() {
    for key in ["", "   \n"] {
        let error = mint_bifrost(&options(json!({ "privateKey": key }))).unwrap_err();
        assert!(matches!(error, BifrostError::NoKey));
        assert!(error.to_string().contains("privateKey is required"));
        assert!(error.to_string().contains("BIFROST_PRIVATE_KEY"));
    }
}

#[test]
fn a_key_of_another_algorithm_is_told_it_must_be_ed25519() {
    // A P-256 key, PKCS#8.
    let p256 = "-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgDRVQOThLtJovB1nb
Fwyn0lSYx4ZEeRwN/UWxpHeNywChRANCAARWRaFpJHO33Dv9G8F3QQxpkLRDnUbx
rYhJ/pP9wFDVqGzXgYZu3bn7jpl8q8WHmTwhksBVP7pgNJy37u6XgnNq
-----END PRIVATE KEY-----";
    let error = mint_bifrost(&options(json!({ "privateKey": p256 }))).unwrap_err();
    assert!(matches!(error, BifrostError::NotEd25519 { .. }), "{error}");
    assert!(error.to_string().contains("must be Ed25519"), "{error}");
}

#[test]
fn something_that_is_not_a_key_at_all_is_an_error_not_a_panic() {
    for key in [
        "not a key",
        "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----",
    ] {
        let error = mint_bifrost(&options(json!({ "privateKey": key }))).unwrap_err();
        assert!(matches!(error, BifrostError::Key(_)), "{error}");
    }
}

#[test]
fn a_number_from_javascript_may_be_a_float_and_is_floored() {
    let float = mint(json!({ "now": 1_704_067_200_999.5_f64, "expiresIn": 60.0 }));
    let claims = segment(&float.token, 1);
    assert_eq!(claims["iat"], json!(NOW / 1000));
    assert_eq!(claims["exp"], json!(NOW / 1000 + 60));
    for bad in [json!(-1), json!(-0.5)] {
        let raw = json!({ "privateKey": KEY, "username": "a", "uuid": "b", "now": bad });
        let error = serde_json::from_value::<BifrostOptions>(raw).unwrap_err();
        assert!(error.to_string().contains("whole, non-negative"), "{error}");
    }
}

#[test]
fn an_option_this_does_not_know_is_refused() {
    let raw = json!({ "privateKey": KEY, "username": "a", "uuid": "b", "expires": 5 });
    assert!(serde_json::from_value::<BifrostOptions>(raw).is_err());
}
