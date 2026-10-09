//! Blobs, as a manifest names them: by the sha256 of their bytes.

use opys_core::{is_blob_id, Artifact, Manifest};
use serde_json::json;

const HELLO: &str = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

#[test]
fn a_manifest_names_each_of_its_blobs_once_and_in_order() {
    let world = "486ea46224d1bb4fb680f34f7c9ad96a8f24ec88be73ea8e5a6c65260e9cb8a7".to_owned();
    let manifest: Manifest = serde_json::from_value(json!({
        "artifacts": [
            { "path": "a", "source": { "blob": world } },
            { "path": "b", "source": { "url": "https://example.test/b" } },
            { "path": "c", "source": { "blob": HELLO } },
            { "path": "d", "source": { "blob": HELLO } },
        ],
    }))
    .unwrap();
    let mut expected = vec![HELLO, world.as_str()];
    expected.sort();
    assert_eq!(
        manifest.blob_ids().into_iter().collect::<Vec<_>>(),
        expected
    );
}

#[test]
fn a_blob_id_is_sixty_four_lowercase_hex_digits() {
    assert!(is_blob_id(HELLO));
    assert!(!is_blob_id(&HELLO[1..]));
    assert!(!is_blob_id(&HELLO.to_uppercase()));

    let mut artifact = Artifact::blob("a", HELLO, 5);
    artifact.metadata = Some(json!({ "note": "kept" }));
    assert_eq!(artifact.blob_id(), Some(HELLO));
}
