//! Ported from the TypeScript unit suites these mappers replaced
//! (`packages/minecraft-vanilla/tests/unit/mappers-*.test.ts`).

use opys_core::{
    ExtractRule, HashEntry, Integrity, MojangRule, MojangRuleset, OsConstraint, OsName, RuleAction,
    Source,
};
use opys_minecraft_vanilla::{
    build_classpath, build_launch, library_to_artifact, map_asset_index, map_asset_objects,
    map_client_jar, map_libraries, ClasspathEntry,
};
use opys_mojang::{AssetIndex, AssetManifest, Client, Libraries, Library};
use serde_json::json;

fn client(extra: serde_json::Value) -> Client {
    let mut raw = json!({
        "id": "1.20.1",
        "type": "release",
        "time": "2023-06-12T00:00:00+00:00",
        "releaseTime": "2023-06-12T00:00:00+00:00",
        "minimumLauncherVersion": 21,
        "assets": "5",
        "complianceLevel": 1,
        "mainClass": "net.minecraft.client.main.Main",
        "assetIndex": {
            "id": "5", "sha1": "a".repeat(40), "size": 100, "totalSize": 200,
            "url": "https://piston-meta.mojang.com/5.json",
        },
        "downloads": {
            "client": { "sha1": "b".repeat(40), "size": 1000, "url": "https://piston-data.mojang.com/client.jar" },
        },
        "libraries": [],
        "arguments": { "game": [], "jvm": [] },
    });
    let (serde_json::Value::Object(base), serde_json::Value::Object(patch)) = (&mut raw, extra)
    else {
        panic!("both must be objects")
    };
    base.extend(patch);
    Client::from_version_json(raw).expect("client")
}

fn libraries(raw: serde_json::Value) -> Libraries {
    Libraries::from_version_json(raw).expect("libraries")
}

fn lib(raw: serde_json::Value) -> Library {
    libraries(json!([raw]))
        .first()
        .expect("one library")
        .clone()
}

fn artifact_json(path: &str, sha1: &str, size: u64) -> serde_json::Value {
    json!({ "path": path, "sha1": sha1, "size": size, "url": format!("https://libraries.minecraft.net/{path}") })
}

fn sha1(hex: &str) -> Integrity {
    Integrity::One(HashEntry::Sha1 {
        sha1: hex.to_owned(),
    })
}

fn allow_os(name: OsName) -> MojangRuleset {
    vec![MojangRule::Os {
        action: RuleAction::Allow,
        os: OsConstraint {
            name: Some(name),
            ..Default::default()
        },
    }]
}

// ── client jar ───────────────────────────────────────────────────────────

#[test]
fn client_jar_carries_the_download_probe() {
    let a = map_client_jar(&client(json!({})));
    assert_eq!(a.path, "${version_dir}/client.jar");
    assert_eq!(
        a.source,
        Source::Url {
            url: "https://piston-data.mojang.com/client.jar".to_owned()
        }
    );
    assert_eq!(a.size, Some(1000));
    assert_eq!(a.integrity, Some(sha1(&"b".repeat(40))));
    assert!(a.rules.is_empty());
    assert!(a.extract.is_none());
}

// ── assets ───────────────────────────────────────────────────────────────

fn asset_index() -> AssetIndex {
    AssetIndex {
        id: "5".to_owned(),
        sha1: "c".repeat(40),
        size: 42,
        total_size: 99,
        url: "https://piston-meta.mojang.com/5.json".to_owned(),
    }
}

#[test]
fn asset_index_lands_under_the_indexes_directory() {
    let a = map_asset_index(&asset_index());
    assert_eq!(a.path, "${assets_root}/indexes/5.json");
    assert_eq!(a.size, Some(42));
    assert_eq!(a.integrity, Some(sha1(&"c".repeat(40))));
}

#[test]
fn asset_objects_are_content_addressed_and_name_tagged() {
    let manifest: AssetManifest = serde_json::from_value(json!({
        "objects": {
            "minecraft/sounds/step.ogg": { "hash": "abcdef0123456789", "size": 7 },
        }
    }))
    .unwrap();
    let arts = map_asset_objects(&manifest);
    assert_eq!(arts.len(), 1);
    assert_eq!(arts[0].path, "${assets_root}/objects/ab/abcdef0123456789");
    assert_eq!(
        arts[0].source,
        Source::Url {
            url: "https://resources.download.minecraft.net/ab/abcdef0123456789".to_owned()
        }
    );
    assert_eq!(arts[0].size, Some(7));
    assert_eq!(
        arts[0].metadata,
        Some(json!({ "name": "minecraft/sounds/step.ogg" }))
    );
    // The hash *is* the path, so the runtime's layout verifies these itself.
    assert!(arts[0].integrity.is_none());
}

#[test]
fn asset_objects_come_out_in_a_stable_order() {
    let manifest: AssetManifest = serde_json::from_value(json!({
        "objects": {
            "zeta": { "hash": "03", "size": 1 },
            "alpha": { "hash": "01", "size": 1 },
            "mu": { "hash": "02", "size": 1 },
        }
    }))
    .unwrap();
    let names: Vec<String> = map_asset_objects(&manifest)
        .iter()
        .map(|a| {
            a.metadata.as_ref().unwrap()["name"]
                .as_str()
                .unwrap()
                .to_owned()
        })
        .collect();
    assert_eq!(names, ["alpha", "mu", "zeta"]);
}

// ── libraries ────────────────────────────────────────────────────────────

#[test]
fn a_plain_library_becomes_a_plain_artifact() {
    let a = library_to_artifact(&lib(json!({
        "name": "com.google.code.gson:gson:2.10.1",
        "downloads": { "artifact": artifact_json("com/google/code/gson/gson/2.10.1/gson-2.10.1.jar", &"d".repeat(40), 250) },
    })));
    assert_eq!(
        a.path,
        "${library_directory}/com/google/code/gson/gson/2.10.1/gson-2.10.1.jar"
    );
    assert_eq!(a.size, Some(250));
    assert_eq!(a.integrity, Some(sha1(&"d".repeat(40))));
    assert!(a.extract.is_none());
}

#[test]
fn a_native_library_is_dumped_into_the_natives_directory() {
    let libs = libraries(json!([{
        "name": "org.lwjgl:lwjgl:3.3.1",
        "downloads": {
            "artifact": artifact_json("org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1.jar", &"e".repeat(40), 10),
            "classifiers": {
                "natives-linux": artifact_json("org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-linux.jar", &"f".repeat(40), 20),
            },
        },
        "natives": { "linux": "natives-linux" },
    }]));
    let arts = map_libraries(&libs);
    assert_eq!(arts.len(), 2);

    let native = arts
        .iter()
        .find(|a| a.path.contains("natives-linux"))
        .unwrap();
    let Some([ExtractRule::Dump(dump)]) = native.extract.as_deref() else {
        panic!("expected one dump rule, got {:?}", native.extract);
    };
    assert_eq!(dump.into, "${natives_directory}");
    assert_eq!(dump.clean, Some(true));
    assert_eq!(
        dump.excludes.as_deref(),
        Some(&["META-INF/".to_owned()][..])
    );
    assert_eq!(native.rules, allow_os(OsName::Linux));
}

#[test]
fn placeholder_probes_are_dropped_rather_than_baked_in() {
    // lwjgl3ify 3.0.25 ships `lzma:lzma:0.0.1` with a real URL, `sha1: ""`
    // and `size: 0`. An empty string is not a hash; handing the verifier one
    // would guarantee a failure it can never clear.
    let a = library_to_artifact(&lib(json!({
        "name": "lzma:lzma:0.0.1",
        "downloads": { "artifact": { "path": "lzma/lzma/0.0.1/lzma-0.0.1.jar", "sha1": "", "size": 0, "url": "https://x/lzma.jar" } },
    })));
    assert!(a.size.is_none());
    assert!(a.integrity.is_none());
    assert_eq!(
        a.source,
        Source::Url {
            url: "https://x/lzma.jar".to_owned()
        }
    );
}

// ── classpath ────────────────────────────────────────────────────────────

fn entry(path: &str, rules: MojangRuleset) -> ClasspathEntry {
    ClasspathEntry {
        rules,
        artifact_path: path.to_owned(),
    }
}

#[test]
fn classpath_has_one_arm_per_os_led_by_the_client_jar() {
    let arms = build_classpath(&[], "client.jar").unwrap();
    assert_eq!(arms.len(), 3);
    assert_eq!(arms[0].rules, allow_os(OsName::Linux));
    assert_eq!(arms[1].rules, allow_os(OsName::Windows));
    assert_eq!(arms[2].rules, allow_os(OsName::Osx));
    assert!(arms.iter().all(|a| a.value == "client.jar"));
}

#[test]
fn each_arm_keeps_only_the_libraries_that_os_allows() {
    let arms = build_classpath(
        &[
            entry("shared.jar", vec![]),
            entry("linux.jar", allow_os(OsName::Linux)),
            entry("windows.jar", allow_os(OsName::Windows)),
        ],
        "client.jar",
    )
    .unwrap();
    let sep = "${classpath_separator}";
    assert_eq!(
        arms[0].value,
        format!("client.jar{sep}shared.jar{sep}linux.jar")
    );
    assert_eq!(
        arms[1].value,
        format!("client.jar{sep}shared.jar{sep}windows.jar")
    );
    assert_eq!(arms[2].value, format!("client.jar{sep}shared.jar"));
}

#[test]
fn classpath_keeps_the_order_it_was_given() {
    let arms = build_classpath(
        &[entry("b.jar", vec![]), entry("a.jar", vec![])],
        "client.jar",
    )
    .unwrap();
    assert!(arms[0].value.ends_with("b.jar${classpath_separator}a.jar"));
}

#[test]
fn an_unparsable_os_version_pattern_is_reported() {
    let broken = vec![MojangRule::Os {
        action: RuleAction::Allow,
        os: OsConstraint {
            version: Some("^10\\.(".to_owned()),
            ..Default::default()
        },
    }];
    assert!(build_classpath(&[entry("x.jar", broken)], "client.jar").is_err());
}

// ── launch ───────────────────────────────────────────────────────────────

#[test]
fn launch_interleaves_jvm_args_main_class_then_game_args() {
    let c = client(json!({
        "arguments": {
            "jvm": ["-cp", "${classpath}"],
            "game": [{ "rules": [{ "action": "allow", "features": { "is_demo_user": true } }], "value": "--demo" }],
        },
    }));
    let parts = build_launch(&c.main_class, &c.args.game, &c.args.jvm);

    assert_eq!(parts.jvm_args.len(), 2);
    assert_eq!(parts.main_class.value, ["net.minecraft.client.main.Main"]);
    assert!(parts.main_class.rules.is_empty());
    assert_eq!(parts.game_args.len(), 1);
    assert_eq!(parts.game_args[0].value, ["--demo"]);
    assert!(!parts.game_args[0].rules.is_empty());

    assert_eq!(parts.launch.command, "${java_bin}");
    assert_eq!(parts.launch.workdir, "./");
    let values: Vec<&str> = parts
        .launch
        .args
        .iter()
        .map(|v| v.value[0].as_str())
        .collect();
    assert_eq!(
        values,
        [
            "-cp",
            "${classpath}",
            "net.minecraft.client.main.Main",
            "--demo"
        ]
    );
}

#[test]
fn a_legacy_version_json_still_gets_its_jvm_args() {
    // Pre-1.13 versions carry `minecraftArguments`, a flat string, and no JVM
    // args at all — the classpath and library path are implied.
    let c = client(json!({
        "arguments": serde_json::Value::Null,
        "minecraftArguments": "--username ${auth_player_name} --version ${version_name}",
    }));
    let parts = build_launch(&c.main_class, &c.args.game, &c.args.jvm);
    let jvm: Vec<&str> = parts.jvm_args.iter().map(|v| v.value[0].as_str()).collect();
    assert_eq!(
        jvm,
        [
            "-Djava.library.path=${natives_directory}",
            "-cp",
            "${classpath}"
        ]
    );
    let game: Vec<&str> = parts
        .game_args
        .iter()
        .map(|v| v.value[0].as_str())
        .collect();
    assert_eq!(
        game,
        [
            "--username",
            "${auth_player_name}",
            "--version",
            "${version_name}"
        ]
    );
}

#[test]
fn a_multi_valued_conditional_argument_keeps_all_its_values() {
    let c = client(json!({
        "arguments": {
            "jvm": [{ "rules": [{ "action": "allow", "os": { "name": "osx" } }], "value": ["-XstartOnFirstThread", "-Xdock:name=Minecraft"] }],
            "game": [],
        },
    }));
    let parts = build_launch(&c.main_class, &c.args.game, &c.args.jvm);
    assert_eq!(
        parts.jvm_args[0].value,
        ["-XstartOnFirstThread", "-Xdock:name=Minecraft"]
    );
}
