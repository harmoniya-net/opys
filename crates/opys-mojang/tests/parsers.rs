//! Ported from the TypeScript unit suites that these parsers replaced
//! (`packages/mojang/tests/unit/*.test.ts`).

use opys_mojang::*;
use serde_json::json;

// ── maven ────────────────────────────────────────────────────────────────

fn coord(s: &str) -> MavenCoord {
    s.parse().unwrap()
}

fn roundtrip(input: &str) {
    assert_eq!(coord(input).to_string(), input);
}

#[test]
fn maven_roundtrips_every_arity() {
    roundtrip("group:artifact");
    roundtrip("ca.weblite:java-objc-bridge:1.1");
    roundtrip("com.google.guava:guava:31.1-jre");
    roundtrip("io.netty:netty-transport-native-epoll:4.1.82.Final:linux-x86_64");
    roundtrip("org.lwjgl:lwjgl-glfw:3.3.1:natives-linux");
    roundtrip("group.id:artifact.id:jar:tests:1.0.0");
}

#[test]
fn maven_fields_are_correct() {
    let c = coord("com.google.guava:guava:31.1-jre");
    assert_eq!(c.group_id, "com.google.guava");
    assert_eq!(c.artifact_id, "guava");
    assert_eq!(c.version.as_deref(), Some("31.1-jre"));
    assert!(c.packaging.is_none());
    assert!(c.classifier.is_none());
}

#[test]
fn is_native_keys_off_the_classifier_prefix() {
    let native = |s: &str| coord(s).is_native();
    assert!(native("org.lwjgl:lwjgl:3.3.1:natives-linux"));
    assert!(!native("org.lwjgl:lwjgl:3.3.1"));
    // A library merely *named* "native" must not be treated as a natives
    // bundle — its whole jar would be dumped into the natives directory,
    // clobbering the real LWJGL .so files.
    assert!(!native(
        "io.netty:netty-transport-native-unix-common:4.1.97.Final"
    ));
    assert!(!native("org.jline:jline-native:3.21.0"));
}

#[test]
fn maven_rejects_malformed_coordinates() {
    assert!("".parse::<MavenCoord>().is_err());
    assert!("one-part".parse::<MavenCoord>().is_err());
    assert!("a:b:c:d:e:f".parse::<MavenCoord>().is_err());
}

#[test]
fn maven_matches_ignoring_version_compares_every_other_field() {
    let base = coord("org.lwjgl:lwjgl:3.3.1:natives-linux");
    assert!(base.matches_ignoring_version(&coord("org.lwjgl:lwjgl:3.3.3:natives-linux")));
    assert!(!base.matches_ignoring_version(&coord("org.lwjgl:lwjgl:3.3.1:natives-windows")));
    assert!(!base.matches_ignoring_version(&coord("org.lwjgl:other:3.3.1")));
}

#[test]
fn encode_maven_drops_incomplete_tails() {
    let two = MavenCoord {
        group_id: "g".into(),
        artifact_id: "a".into(),
        ..Default::default()
    };
    assert_eq!(two.to_string(), "g:a");
    let packaging_only = MavenCoord {
        packaging: Some("jar".into()),
        ..two.clone()
    };
    assert_eq!(packaging_only.to_string(), "g:a");
}

// ── libraries ────────────────────────────────────────────────────────────

fn artifact(path: &str) -> serde_json::Value {
    json!({ "path": path, "sha1": "deadbeef", "size": 1, "url": format!("https://x/{path}") })
}

#[test]
fn library_without_natives() {
    let libs = Libraries::from_version_json(json!([{
        "name": "com.google.code.gson:gson:2.10.1",
        "downloads": { "artifact": artifact("gson-2.10.1.jar") },
    }]))
    .unwrap();
    assert_eq!(libs.len(), 1);
    assert_eq!(libs[0].name.to_string(), "com.google.code.gson:gson:2.10.1");
    assert!(libs[0].rules.is_empty());
    assert!(!libs[0].native);
}

#[test]
fn native_classifiers_produce_one_entry_each() {
    let libs = Libraries::from_version_json(json!([{
        "name": "org.lwjgl:lwjgl:3.3.1",
        "downloads": {
            "artifact": artifact("lwjgl-3.3.1.jar"),
            "classifiers": {
                "natives-linux": artifact("lwjgl-3.3.1-natives-linux.jar"),
                "natives-windows": artifact("lwjgl-3.3.1-natives-windows.jar"),
            },
        },
        "natives": { "linux": "natives-linux", "windows": "natives-windows" },
    }]))
    .unwrap();
    // one main artifact plus one per classifier
    assert_eq!(libs.len(), 3);

    let main = libs.iter().find(|l| l.rules.is_empty()).expect("main");
    assert!(!main.native);
    assert_eq!(libs.iter().filter(|l| l.native).count(), 2);

    // One entry per declared native, regardless of iteration order.
    let mut native_paths: Vec<&str> = libs
        .iter()
        .filter(|l| l.native)
        .map(|l| l.artifact.path.as_str())
        .collect();
    native_paths.sort_unstable();
    assert_eq!(
        native_paths,
        [
            "lwjgl-3.3.1-natives-linux.jar",
            "lwjgl-3.3.1-natives-windows.jar"
        ]
    );
}

#[test]
fn natives_entry_without_a_matching_classifier_is_skipped() {
    let libs = Libraries::from_version_json(json!([{
        "name": "org.lwjgl:lwjgl:3.3.1",
        "downloads": {
            "classifiers": { "natives-linux": artifact("lwjgl-natives-linux.jar") },
        },
        // declares a windows native, but no windows classifier exists
        "natives": { "linux": "natives-linux", "windows": "natives-windows" },
    }]))
    .unwrap();
    assert_eq!(libs.len(), 1);
    assert!(libs[0].native);
}

#[test]
fn arch_placeholder_is_substituted_in_the_classifier_key() {
    let libs = Libraries::from_version_json(json!([{
        "name": "ca.weblite:java-objc-bridge:1.1",
        "downloads": {
            "classifiers": { "natives-osx-64": artifact("java-objc-bridge-1.1-natives-osx-64.jar") },
        },
        "natives": { "osx": "natives-osx-{arch}" },
    }]))
    .unwrap();
    assert_eq!(libs.len(), 1);
    assert!(libs[0].artifact.path.contains("natives-osx-64"));
}

// ── arguments ────────────────────────────────────────────────────────────

#[test]
fn legacy_arguments_string_splits_and_implies_jvm_args() {
    let args = Arguments::from_version_json(json!(
        "--username ${auth_player_name} --version ${version_name}"
    ))
    .unwrap();
    assert!(args.legacy);
    assert_eq!(args.game.len(), 4);
    assert_eq!(args.jvm, Arguments::legacy_jvm_args());
}

#[test]
fn modern_arguments_object_defaults_missing_arrays() {
    let args = Arguments::from_version_json(json!({ "game": ["--demo"] })).unwrap();
    assert!(!args.legacy);
    assert_eq!(args.game.len(), 1);
    assert!(args.jvm.is_empty());
}

#[test]
fn conditional_argument_objects_keep_their_value_shape() {
    let args = Arguments::from_version_json(json!({
        "game": [
            "--plain",
            { "rules": [{ "action": "allow", "os": { "name": "osx" } }], "value": "-XstartOnFirstThread" },
            { "rules": [], "value": ["--width", "${resolution_width}"] },
        ],
        "jvm": [],
    }))
    .unwrap();
    assert!(matches!(args.game[0], MojangArgValue::Plain(_)));
    match &args.game[1] {
        MojangArgValue::Conditional { rules, value } => {
            assert_eq!(rules.len(), 1);
            assert!(matches!(value, ArgValue::One(_)));
        }
        other => panic!("expected conditional, got {other:?}"),
    }
    match &args.game[2] {
        MojangArgValue::Conditional { value, .. } => {
            assert!(matches!(value, ArgValue::Many(v) if v.len() == 2))
        }
        other => panic!("expected conditional, got {other:?}"),
    }
}

#[test]
fn merge_args_concatenates_base_then_patch() {
    let base = Arguments::from_version_json(json!({ "game": ["a"], "jvm": ["x"] })).unwrap();
    let patch = Arguments::from_version_json(json!({ "game": ["b"], "jvm": ["y"] })).unwrap();
    let merged = base.merge(&patch);
    assert_eq!(merged.game.len(), 2);
    assert_eq!(merged.jvm.len(), 2);
    assert!(!merged.legacy);
}

#[test]
fn merge_args_returns_base_when_the_patch_is_legacy() {
    let base = Arguments::from_version_json(json!({ "game": ["a"], "jvm": ["x"] })).unwrap();
    let patch = Arguments::from_version_json(json!("--legacy arg")).unwrap();
    assert_eq!(base.merge(&patch), base);
}

// ── assets ───────────────────────────────────────────────────────────────

#[test]
fn asset_url_and_path_shard_on_the_first_two_characters() {
    let hash = "3dfaac0d31cf26733989c9354964646700810777";
    assert_eq!(
        asset_url(hash),
        format!("https://resources.download.minecraft.net/3d/{hash}")
    );
    assert_eq!(asset_path(hash), format!("3d/{hash}"));
}

#[test]
fn asset_sharding_is_total_on_short_hashes() {
    assert_eq!(asset_path("a"), "a/a");
    assert_eq!(asset_path(""), "/");
}

// ── client ───────────────────────────────────────────────────────────────

fn minimal_client() -> serde_json::Value {
    json!({
        "id": "1.20.1",
        "javaVersion": { "component": "java-runtime-gamma", "majorVersion": 17 },
        "assetIndex": { "id": "5", "sha1": "a", "size": 1, "totalSize": 2, "url": "https://x" },
        "downloads": { "client": { "sha1": "b", "size": 3, "url": "https://y" } },
        "mainClass": "net.minecraft.client.main.Main",
        "libraries": [],
        "minecraftArguments": "--demo",
        "type": "release",
        "time": "t",
        "releaseTime": "rt",
        "minimumLauncherVersion": 21,
        "assets": "5",
    })
}

#[test]
fn parses_a_minimal_client_json() {
    let c = Client::from_version_json(minimal_client()).unwrap();
    assert_eq!(c.id, "1.20.1");
    assert_eq!(c.java.major_version, 17);
    assert_eq!(c.metadata.compliance_level, 0);
    assert!(c.args.legacy);
    assert!(c.logging.is_none());
}

#[test]
fn client_without_java_version_falls_back_to_jre_legacy() {
    let mut raw = minimal_client();
    raw.as_object_mut().unwrap().remove("javaVersion");
    let c = Client::from_version_json(raw).unwrap();
    assert_eq!(c.java.component, "jre-legacy");
    assert_eq!(c.java.major_version, 8);
}

#[test]
fn client_without_any_arguments_is_rejected() {
    let mut raw = minimal_client();
    raw.as_object_mut().unwrap().remove("minecraftArguments");
    assert!(Client::from_version_json(raw).is_err());
}

#[test]
fn downloads_reads_the_snake_case_wire_keys() {
    let mut raw = minimal_client();
    raw["downloads"]["server"] = json!({ "sha1": "s", "size": 9, "url": "https://s" });
    raw["downloads"]["client_mappings"] = json!({ "sha1": "m", "size": 8, "url": "https://m" });
    let c = Client::from_version_json(raw).unwrap();
    assert!(c.downloads.server.is_some());
    assert!(c.downloads.client_mappings.is_some());
}

// ── version manifest ─────────────────────────────────────────────────────

fn manifest() -> VersionManifest {
    serde_json::from_value(json!({
        "latest": { "release": "1.20.1", "snapshot": "23w31a" },
        "versions": [{
            "id": "1.20.1", "type": "release", "url": "https://v",
            "time": "t", "releaseTime": "rt", "sha1": "s", "complianceLevel": 1,
        }],
    }))
    .unwrap()
}

#[test]
fn find_version_looks_up_by_id() {
    assert!(manifest().find("1.20.1").is_some());
    assert!(manifest().find("nope").is_none());
}

#[test]
fn latest_release_resolves_through_the_latest_pointer() {
    assert_eq!(manifest().latest_release().unwrap().id, "1.20.1");
}

#[test]
fn latest_release_is_none_when_the_pointer_dangles() {
    let mut m = manifest();
    m.latest.release = "missing".into();
    assert!(m.latest_release().is_none());
}

// ── round-trip ───────────────────────────────────────────────────────────
//
// A domain value crosses the napi boundary as JSON and comes back — a loader
// calls `parseClient`, holds the result, then hands it to `clientToTemplate`.
// So `serialize` must be the inverse of `deserialize` for every domain type,
// which is why reading a *version JSON* is `from_version_json` rather than a
// `Deserialize` impl.

fn roundtrips<T>(value: &T)
where
    T: serde::Serialize + serde::de::DeserializeOwned + PartialEq + std::fmt::Debug,
{
    let json = serde_json::to_value(value).unwrap();
    let back: T = serde_json::from_value(json.clone()).unwrap();
    assert_eq!(&back, value);
    assert_eq!(serde_json::to_value(&back).unwrap(), json);
}

#[test]
fn client_roundtrips_through_its_own_json() {
    roundtrips(&Client::from_version_json(minimal_client()).unwrap());
}

#[test]
fn libraries_roundtrip_after_natives_are_flattened() {
    let libs = Libraries::from_version_json(json!([{
        "name": "org.lwjgl:lwjgl:3.3.1",
        "downloads": {
            "artifact": artifact("lwjgl-3.3.1.jar"),
            "classifiers": { "natives-linux": artifact("lwjgl-3.3.1-natives-linux.jar") },
        },
        "natives": { "linux": "natives-linux" },
    }]))
    .unwrap();
    assert_eq!(libs.len(), 2);
    roundtrips(&libs);
}

#[test]
fn legacy_arguments_stay_legacy_across_a_roundtrip() {
    let args = Arguments::from_version_json(json!("--username ${auth_player_name}")).unwrap();
    assert!(args.legacy);
    roundtrips(&args);

    // The flag surviving is what makes `merge` correct on the far side of the
    // boundary: a legacy patch carries no structured delta, so the base wins.
    let back: Arguments = serde_json::from_value(serde_json::to_value(&args).unwrap()).unwrap();
    let base = Arguments::from_version_json(json!({ "game": ["a"], "jvm": ["x"] })).unwrap();
    assert_eq!(base.merge(&back), base);
}
