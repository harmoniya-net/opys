//! `overwrite`: what becomes of a file that is already there.

use opys_core::{Artifact, Overwrite};
use serde_json::{json, Value};

const HELLO: &str = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

fn decode(artifact: Value) -> Result<Artifact, String> {
    serde_json::from_value(artifact).map_err(|e| e.to_string())
}

#[test]
fn never_reads_back_as_written() {
    let written =
        json!({ "path": "options.txt", "source": { "blob": HELLO }, "overwrite": "never" });
    let artifact = decode(written.clone()).unwrap();
    assert_eq!(artifact.overwrite, Overwrite::Never);
    assert_eq!(serde_json::to_value(artifact).unwrap(), written);
}

#[test]
fn always_is_the_default_and_is_not_written() {
    let written = json!({ "path": "a.jar", "source": { "url": "https://example.test/a.jar" } });
    let artifact = decode(written.clone()).unwrap();
    assert_eq!(artifact.overwrite, Overwrite::Always);
    assert_eq!(serde_json::to_value(artifact).unwrap(), written);
    let said = decode(json!({
        "path": "a.jar",
        "source": { "url": "https://example.test/a.jar" },
        "overwrite": "always",
    }))
    .unwrap();
    assert_eq!(serde_json::to_value(said).unwrap(), written);
}

#[test]
fn an_unknown_answer_is_refused_by_name() {
    let error = decode(json!({
        "path": "options.txt",
        "source": { "blob": HELLO },
        "overwrite": "unmodified",
    }))
    .unwrap_err();
    assert!(
        error.contains("unknown variant `unmodified`, expected `always` or `never`"),
        "{error}"
    );
}

#[test]
fn keeps_the_blob_as_its_integrity() {
    // What is installed is still verified: `overwrite` says nothing of bytes.
    let artifact = decode(json!({
        "path": "options.txt",
        "source": { "blob": HELLO },
        "overwrite": "never",
    }))
    .unwrap();
    assert!(artifact.integrity.is_some());
}

#[test]
fn an_archive_cannot_be_left_to_the_player() {
    let error = decode(json!({
        "path": "configs.zip",
        "source": { "blob": HELLO },
        "extract": [{ "kind": "dump", "into": "config" }],
        "overwrite": "never",
    }))
    .unwrap_err();
    assert!(
        error.contains("configs.zip: an archive is unpacked again on every install"),
        "{error}"
    );
}
