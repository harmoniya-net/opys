//! Mirrors core/tests/unit/manifest.test.ts.

use opys_core::{
    deduplicate_artifacts, filter_manifest, parse_manifest, Artifact, Manifest, OsOptions, Source,
};
use serde_json::json;

/// The domain types decode and encode themselves; wire types are internal to
/// `opys-core`, so the tests go through serde exactly as any consumer does.
fn decode<T: serde::de::DeserializeOwned>(value: serde_json::Value) -> T {
    serde_json::from_value(value).unwrap()
}

fn encode<T: serde::Serialize>(value: &T) -> serde_json::Value {
    serde_json::to_value(value).unwrap()
}

fn linux() -> OsOptions {
    OsOptions {
        name: "linux".into(),
        version: "".into(),
        arch: "x86_64".into(),
    }
}

fn osx_x86() -> OsOptions {
    OsOptions {
        name: "osx".into(),
        version: "".into(),
        arch: "x86_64".into(),
    }
}

fn make_artifact(path: &str) -> Artifact {
    Artifact {
        path: path.into(),
        source: Source::Url {
            url: "https://x/a".into(),
        },
        size: None,
        rules: Vec::new(),
        integrity: None,
        metadata: None,
        extract: None,
    }
}

#[test]
fn parse_manifest_parses_empty_json() {
    let u = parse_manifest("{}").unwrap();
    assert_eq!(u.artifacts.len(), 0);
}

#[test]
fn parse_manifest_rejects_invalid_json() {
    let err = parse_manifest("{ bad json").unwrap_err();
    assert!(err.to_string().contains("Failed to parse manifest"));
}

#[test]
fn parse_manifest_rejects_schema_invalid() {
    let err = parse_manifest("{ \"artifacts\": 5 }").unwrap_err();
    assert!(err.to_string().contains("Failed to parse manifest"));
}

#[test]
fn parse_manifest_with_vars_launch_artifacts_restrict() {
    let input = json!({
        "vars": { "root": "." },
        "launch": { "command": "java", "workdir": "." },
        "artifacts": [{ "path": "a.jar", "source": { "url": "https://x" } }],
        "restrict": ["mods/**"]
    });
    let u = parse_manifest(&input.to_string()).unwrap();
    assert_eq!(u.vars.len(), 1);
    assert_eq!(u.launch.as_ref().unwrap().command, "java");
    assert_eq!(u.artifacts.len(), 1);
    assert_eq!(u.restrict.as_ref().unwrap(), &vec!["mods/**".to_owned()]);
}

#[test]
fn round_trips_minimal_manifest() {
    let m: Manifest = decode(json!({
        "artifacts": [{ "path": "a", "source": { "url": "https://x/a" } }]
    }));
    let encoded = encode(&m);
    assert_eq!(
        encoded,
        json!({
            "vars": {},
            "artifacts": [{ "path": "a", "source": { "url": "https://x/a" } }]
        })
    );
}

#[test]
fn round_trips_vars_launch_restrict() {
    let m: Manifest = decode(json!({
        "vars": { "root": "." },
        "launch": { "command": "java", "workdir": "/srv", "args": ["-jar"] },
        "artifacts": [],
        "restrict": ["mods/**"]
    }));
    let encoded = encode(&m);
    assert_eq!(encoded["vars"]["root"], json!("."));
    assert_eq!(encoded["launch"]["command"], json!("java"));
    assert_eq!(encoded["restrict"], json!(["mods/**"]));
}

#[test]
fn omits_empty_restrict_on_encode() {
    let m = Manifest {
        vars: Default::default(),
        launch: None,
        artifacts: Vec::new(),
        restrict: Some(Vec::new()),
    };
    let encoded = encode(&m);
    assert!(encoded.get("restrict").is_none());
}

#[test]
fn defaults_missing_vars_and_artifacts() {
    let m: Manifest = decode(json!({}));
    assert_eq!(m.vars.len(), 0);
    assert_eq!(m.artifacts.len(), 0);
    assert!(m.restrict.is_none());
    assert!(m.launch.is_none());
}

#[test]
fn filter_returns_only_matching_artifacts() {
    let u = Manifest {
        vars: Default::default(),
        launch: None,
        artifacts: vec![make_artifact("a"), make_artifact("b")],
        restrict: None,
    };
    assert_eq!(
        filter_manifest(&u, &linux(), &[]).unwrap().artifacts.len(),
        2
    );
}

#[test]
fn filter_drops_artifacts_excluded_by_rules() {
    let linux_only: Artifact = decode(json!({
        "path": "l",
        "source": { "url": "https://x/a" },
        "rules": "allow.os.linux"
    }));
    let u = Manifest {
        vars: Default::default(),
        launch: None,
        artifacts: vec![linux_only, make_artifact("b")],
        restrict: None,
    };
    assert_eq!(
        filter_manifest(&u, &linux(), &[]).unwrap().artifacts.len(),
        2
    );
    let on_osx = filter_manifest(&u, &osx_x86(), &[]).unwrap();
    assert_eq!(on_osx.artifacts.len(), 1);
    assert_eq!(on_osx.artifacts[0].path, "b");
}

#[test]
fn filter_preserves_restrict() {
    let u = Manifest {
        vars: Default::default(),
        launch: None,
        artifacts: Vec::new(),
        restrict: Some(vec!["mods/**".into()]),
    };
    let filtered = filter_manifest(&u, &linux(), &[]).unwrap();
    assert_eq!(
        filtered.restrict.as_ref().unwrap(),
        &vec!["mods/**".to_owned()]
    );
}

#[test]
fn dedup_keeps_last_entry_for_dup_paths() {
    let mut first = make_artifact("libs/foo.jar");
    first.metadata = Some(json!("first"));
    let mut second = make_artifact("libs/foo.jar");
    second.metadata = Some(json!("second"));
    let result = deduplicate_artifacts(vec![first, second]);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].metadata.as_ref().unwrap(), &json!("second"));
}

#[test]
fn dedup_normalizes_path_before_comparing() {
    let mut first = make_artifact("libs/./foo.jar");
    first.metadata = Some(json!("first"));
    let mut second = make_artifact("libs/foo.jar");
    second.metadata = Some(json!("second"));
    let result = deduplicate_artifacts(vec![first, second]);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].metadata.as_ref().unwrap(), &json!("second"));
}

#[test]
fn dedup_preserves_insertion_order_for_unique_paths() {
    let arts = vec![make_artifact("a"), make_artifact("b"), make_artifact("c")];
    let paths: Vec<String> = deduplicate_artifacts(arts)
        .into_iter()
        .map(|a| a.path)
        .collect();
    assert_eq!(paths, vec!["a", "b", "c"]);
}

// ── what the format no longer has ─────────────────────────────────────────

#[test]
fn a_pointer_source_is_refused() {
    // Resolving a source on the installing machine is gone from the format; a
    // manifest that still asks for it must not parse as something else.
    let raw = json!({
        "vars": {},
        "artifacts": [{ "path": "a.jar", "source": { "pointer": "https://example.test/a.json" } }],
    });
    assert!(serde_json::from_value::<Manifest>(raw).is_err());
}

#[test]
fn a_discovery_block_is_refused_rather_than_read_past() {
    // This artifact's only integrity is in the block. Dropping the unknown key
    // would install the file unverified and say nothing.
    let raw = json!({
        "vars": {},
        "artifacts": [{
            "path": "jdk.tar.gz",
            "source": { "url": "https://example.test/jdk.tar.gz" },
            "discovery": { "integrity": { "url": { "sha256": "${url}.sha256" } } },
        }],
    });
    let message = serde_json::from_value::<Manifest>(raw)
        .unwrap_err()
        .to_string();
    assert!(message.contains("unknown field `discovery`"), "{message}");
}

#[test]
fn a_file_written_into_the_manifest_or_read_off_the_machine_is_refused() {
    // The three sources a blob replaces. Each is refused by name, so an old
    // manifest fails saying what it asked for.
    for (field, value) in [
        ("file", "/srv/a.jar"),
        ("string", "hello"),
        ("bytes", "aGVsbG8="),
    ] {
        let raw = json!({ "vars": {}, "artifacts": [{ "path": "a", "source": { field: value } }] });
        let message = serde_json::from_value::<Manifest>(raw)
            .unwrap_err()
            .to_string();
        assert!(
            message.contains(&format!("unknown field `{field}`")),
            "{message}"
        );
    }
}

#[test]
fn metadata_is_where_anything_else_goes() {
    let raw = json!({
        "vars": {},
        "artifacts": [{
            "path": "a.jar",
            "source": { "url": "https://example.test/a.jar" },
            "metadata": { "anything": ["at", "all"] },
        }],
    });
    let manifest: Manifest = serde_json::from_value(raw).unwrap();
    assert_eq!(
        manifest.artifacts[0].metadata,
        Some(json!({ "anything": ["at", "all"] }))
    );
}

// ── blobs ─────────────────────────────────────────────────────────────────

const HELLO: &str = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

#[test]
fn a_blob_artifact_is_verified_by_its_own_name() {
    // Nothing is written beside the source, and the artifact still comes out
    // with an integrity — so an installer verifies it like any download.
    let artifact: Artifact =
        decode(json!({ "path": "a.txt", "source": { "blob": HELLO }, "size": 5 }));
    assert_eq!(artifact.blob_id(), Some(HELLO));
    assert_eq!(encode(&artifact.integrity), json!({ "sha256": HELLO }));
}

#[test]
fn a_blob_artifact_has_one_spelling() {
    // An integrity that agrees is accepted and not written back.
    let written = json!({ "path": "a.txt", "source": { "blob": HELLO }, "size": 5, "integrity": { "sha256": HELLO } });
    let artifact: Artifact = decode(written);
    assert_eq!(
        encode(&artifact),
        json!({ "path": "a.txt", "source": { "blob": HELLO }, "size": 5 })
    );
    assert_eq!(
        encode(&Artifact::blob("a.txt", HELLO, 5)),
        encode(&artifact)
    );
}

#[test]
fn a_blob_artifact_whose_integrity_names_other_bytes_is_refused() {
    for integrity in [
        json!({ "sha256": "0".repeat(64) }),
        json!({ "sha1": "0".repeat(40) }),
    ] {
        let raw = json!({ "path": "a.txt", "source": { "blob": HELLO }, "integrity": integrity });
        let message = serde_json::from_value::<Artifact>(raw)
            .unwrap_err()
            .to_string();
        assert!(
            message.contains("a.txt: a blob is verified by its own name"),
            "{message}"
        );
    }
}

#[test]
fn a_blob_id_is_a_lowercase_sha256_and_nothing_else() {
    for id in [
        "",
        "abc",
        &HELLO.to_uppercase(),
        &format!("{HELLO}00"),
        "blobs/x",
        &"g".repeat(64),
    ] {
        let raw = json!({ "path": "a", "source": { "blob": id } });
        let message = serde_json::from_value::<Artifact>(raw)
            .unwrap_err()
            .to_string();
        assert!(message.contains("is not a blob id"), "{id}: {message}");
    }
}

#[test]
fn a_source_names_exactly_one_place() {
    let both = json!({ "path": "a", "source": { "url": "https://x/a", "blob": HELLO } });
    assert!(serde_json::from_value::<Artifact>(both)
        .unwrap_err()
        .to_string()
        .contains("not both"));
    let neither = json!({ "path": "a", "source": {} });
    assert!(serde_json::from_value::<Artifact>(neither)
        .unwrap_err()
        .to_string()
        .contains("names neither"));
}

#[test]
fn a_url_artifact_keeps_the_integrity_it_was_given() {
    let raw = json!({ "path": "a", "source": { "url": "https://x/a" }, "integrity": { "sha1": "0".repeat(40) } });
    assert_eq!(encode(&decode::<Artifact>(raw.clone())), raw);
    assert_eq!(
        decode::<Artifact>(json!({ "path": "a", "source": { "url": "https://x/a" } })).integrity,
        None
    );
}
