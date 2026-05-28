//! Mirrors core/tests/unit/manifest.test.ts.

use serde_json::json;
use lanka_core::{
    decode_manifest, deduplicate_artifacts, encode_manifest, filter_manifest, parse_manifest,
    Artifact, Manifest, ManifestWire, OsOptions, Source,
};

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
        source: Source::String { string: "x".into() },
        size: None,
        rules: Vec::new(),
        integrity: None,
        discovery: None,
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
    let wire: ManifestWire = serde_json::from_value(json!({
        "artifacts": [{ "path": "a", "source": { "string": "x" } }]
    }))
    .unwrap();
    let m = decode_manifest(wire).unwrap();
    let encoded = encode_manifest(&m);
    assert_eq!(
        encoded,
        json!({
            "vars": {},
            "artifacts": [{ "path": "a", "source": { "string": "x" } }]
        })
    );
}

#[test]
fn round_trips_vars_launch_restrict() {
    let wire: ManifestWire = serde_json::from_value(json!({
        "vars": { "root": "." },
        "launch": { "command": "java", "workdir": "/srv", "args": ["-jar"] },
        "artifacts": [],
        "restrict": ["mods/**"]
    }))
    .unwrap();
    let m = decode_manifest(wire).unwrap();
    let encoded = encode_manifest(&m);
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
    let encoded = encode_manifest(&m);
    assert!(encoded.get("restrict").is_none());
}

#[test]
fn defaults_missing_vars_and_artifacts() {
    let m = decode_manifest(serde_json::from_value(json!({})).unwrap()).unwrap();
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
    assert_eq!(filter_manifest(&u, &linux(), &[]).unwrap().artifacts.len(), 2);
}

#[test]
fn filter_drops_artifacts_excluded_by_rules() {
    let wire: lanka_core::ArtifactWire = serde_json::from_value(json!({
        "path": "l",
        "source": { "string": "x" },
        "rules": "allow.os.linux"
    }))
    .unwrap();
    let linux_only = lanka_core::decode_artifact(wire).unwrap();
    let u = Manifest {
        vars: Default::default(),
        launch: None,
        artifacts: vec![linux_only, make_artifact("b")],
        restrict: None,
    };
    assert_eq!(filter_manifest(&u, &linux(), &[]).unwrap().artifacts.len(), 2);
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
    assert_eq!(filtered.restrict.as_ref().unwrap(), &vec!["mods/**".to_owned()]);
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
    let paths: Vec<String> = deduplicate_artifacts(arts).into_iter().map(|a| a.path).collect();
    assert_eq!(paths, vec!["a", "b", "c"]);
}
