//! `once`: an artifact installed where its file is missing and the player's
//! afterwards.

use opys_core::Artifact;
use serde_json::{json, Value};

const HELLO: &str = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

fn decode(artifact: Value) -> Result<Artifact, String> {
    serde_json::from_value(artifact).map_err(|e| e.to_string())
}

#[test]
fn reads_back_as_written() {
    let written = json!({ "path": "options.txt", "source": { "blob": HELLO }, "once": true });
    let artifact = decode(written.clone()).unwrap();
    assert!(artifact.once);
    assert_eq!(serde_json::to_value(artifact).unwrap(), written);
}

#[test]
fn is_off_unless_said_and_says_nothing_when_off() {
    let written = json!({ "path": "a.jar", "source": { "url": "https://example.test/a.jar" } });
    let artifact = decode(written.clone()).unwrap();
    assert!(!artifact.once);
    assert_eq!(serde_json::to_value(artifact).unwrap(), written);
    let off = decode(json!({ "path": "a.jar", "source": { "url": "https://example.test/a.jar" }, "once": false }))
        .unwrap();
    assert_eq!(serde_json::to_value(off).unwrap(), written);
}

#[test]
fn keeps_the_blob_as_its_integrity() {
    // What is installed is still verified: `once` says nothing about bytes.
    let artifact =
        decode(json!({ "path": "options.txt", "source": { "blob": HELLO }, "once": true }))
            .unwrap();
    assert!(artifact.integrity.is_some());
}

#[test]
fn an_archive_cannot_be_the_players() {
    let error = decode(json!({
        "path": "configs.zip",
        "source": { "blob": HELLO },
        "extract": [{ "kind": "dump", "into": "config" }],
        "once": true,
    }))
    .unwrap_err();
    assert!(
        error.contains("configs.zip: an archive is unpacked again on every install"),
        "{error}"
    );
}
