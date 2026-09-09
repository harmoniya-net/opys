//! Ported from the TypeScript unit suites these mappers replaced
//! (`packages/minecraft-vanilla/tests/unit/mappers-*.test.ts`).

use opys_core::{
    ExtractRule, HashEntry, Integrity, MojangRule, MojangRuleset, OsConstraint, OsName, RuleAction,
    Source,
};
use opys_minecraft_vanilla::{
    build_classpath, build_launch, inherited_classpath, library_to_artifact, map_asset_index,
    map_asset_objects, map_client_jar, map_libraries, superseded, ClasspathEntry, CLIENT_MODULE,
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
        module: None,
    }
}

/// An entry that names a module, so it can supersede or be superseded.
fn module_entry(module: &str, path: &str) -> ClasspathEntry {
    ClasspathEntry {
        rules: Vec::new(),
        artifact_path: path.to_owned(),
        module: Some(module.to_owned()),
    }
}

#[test]
fn classpath_has_one_arm_per_os_ending_in_the_client_jar() {
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
        format!("shared.jar{sep}linux.jar{sep}client.jar")
    );
    assert_eq!(
        arms[1].value,
        format!("shared.jar{sep}windows.jar{sep}client.jar")
    );
    assert_eq!(arms[2].value, format!("shared.jar{sep}client.jar"));
}

#[test]
fn classpath_keeps_the_order_it_was_given() {
    let arms = build_classpath(
        &[entry("b.jar", vec![]), entry("a.jar", vec![])],
        "client.jar",
    )
    .unwrap();
    assert!(arms[0]
        .value
        .starts_with("b.jar${classpath_separator}a.jar"));
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

#[test]
fn an_inherited_classpath_puts_the_patch_ahead_of_the_base() {
    // What `inheritsFrom` means. A loader that ships its own build of a
    // library vanilla also ships gets used only by being first — order is the
    // only thing the JVM consults when two entries carry the same class.
    let arms = inherited_classpath(
        &[entry("forge-asm.jar", vec![])],
        &[entry("vanilla-asm.jar", vec![])],
        "client.jar",
    )
    .unwrap();
    let sep = "${classpath_separator}";
    assert_eq!(
        arms[0].value,
        format!("forge-asm.jar{sep}vanilla-asm.jar{sep}client.jar")
    );
}

#[test]
fn an_inherited_classpath_still_gates_each_side_by_its_own_rules() {
    let arms = inherited_classpath(
        &[entry("patch-linux.jar", allow_os(OsName::Linux))],
        &[entry("base-windows.jar", allow_os(OsName::Windows))],
        "client.jar",
    )
    .unwrap();
    assert!(arms[0].value.contains("patch-linux.jar"));
    assert!(!arms[0].value.contains("base-windows.jar"));
    assert!(arms[1].value.contains("base-windows.jar"));
    assert!(!arms[1].value.contains("patch-linux.jar"));
}

#[test]
fn a_base_entry_the_patch_supersedes_is_dropped_rather_than_left_behind_it() {
    let arms = inherited_classpath(
        &[module_entry("org.ow2.asm:asm-all", "asm-5.2.jar")],
        &[
            module_entry("org.ow2.asm:asm-all", "asm-4.1.jar"),
            module_entry("com.google.code.gson:gson", "gson.jar"),
        ],
        "client.jar",
    )
    .unwrap();
    assert_eq!(
        arms[0].value,
        "asm-5.2.jar${classpath_separator}gson.jar${classpath_separator}client.jar"
    );
}

#[test]
fn superseded_names_the_base_paths_that_dropped_out() {
    // The caller needs these to keep the download set in step with `-cp`.
    let dropped = superseded(
        &[module_entry("org.ow2.asm:asm-all", "asm-5.2.jar")],
        &[
            module_entry("org.ow2.asm:asm-all", "asm-4.1.jar"),
            module_entry("com.google.code.gson:gson", "gson.jar"),
        ],
        "client.jar",
    );
    assert_eq!(dropped, ["asm-4.1.jar"]);
}

#[test]
fn an_entry_with_no_module_is_never_dropped() {
    // Natives opt out, and so does any caller that declines to key its
    // entries — a `None` module means "this supersedes nothing and is
    // superseded by nothing".
    let arms = inherited_classpath(
        &[module_entry("org.lwjgl:lwjgl", "lwjgl-3.3.1.jar")],
        &[
            entry("lwjgl-2.9.0-natives-linux.jar", vec![]),
            entry("lwjgl-2.9.0-natives-windows.jar", vec![]),
        ],
        "client.jar",
    )
    .unwrap();
    assert!(arms[0].value.contains("natives-linux"));
    assert!(arms[1].value.contains("natives-windows"));
}

#[test]
fn a_libraries_natives_do_not_share_its_module_key() {
    // A pre-1.19 version JSON declares natives *inside* the library that needs
    // them, and they expand into entries carrying that library's coordinate
    // verbatim. Keying on the coordinate would let one patch library delete a
    // whole per-OS native set along with the jar it meant to replace.
    let raw = json!([{
        "name": "org.lwjgl.lwjgl:lwjgl:2.9.0",
        "downloads": {
            "artifact": { "path": "l/lwjgl-2.9.0.jar", "sha1": "a".repeat(40), "size": 1, "url": "https://x/l.jar" },
            "classifiers": {
                "natives-linux": { "path": "l/lwjgl-2.9.0-natives-linux.jar", "sha1": "b".repeat(40), "size": 1, "url": "https://x/n.jar" },
            },
        },
        "natives": { "linux": "natives-linux" },
    }]);
    let libs = Libraries::from_version_json(raw).unwrap();
    let entries: Vec<ClasspathEntry> = libs.iter().map(ClasspathEntry::of).collect();

    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].module.as_deref(), Some("org.lwjgl.lwjgl:lwjgl"));
    assert_eq!(entries[1].module, None, "the natives entry must opt out");
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

#[test]
fn a_patch_that_lists_the_client_jar_itself_replaces_it_rather_than_doubling_it() {
    // A Forge document lists the vanilla jar as a library so the wrapper can be
    // handed a path to it. Keeping `${version_dir}/client.jar` beside it hands
    // BootstrapLauncher two modules exporting the same packages, and Forge's
    // `ignoreList` only covers the copy it knows the name of.
    let patch = [module_entry(
        CLIENT_MODULE,
        "${library_directory}/com/mojang/minecraft/1.20.1/minecraft-1.20.1-client.jar",
    )];
    let arms = inherited_classpath(&patch, &[], "${version_dir}/client.jar").unwrap();

    assert!(!arms[0].value.contains("${version_dir}/client.jar"));
    assert!(arms[0].value.contains("minecraft-1.20.1-client.jar"));
    // …and the copy that dropped out is not downloaded either.
    assert_eq!(
        superseded(&patch, &[], "${version_dir}/client.jar"),
        ["${version_dir}/client.jar"]
    );
}

#[test]
fn a_patch_that_does_not_list_the_client_jar_keeps_it_last() {
    let arms = inherited_classpath(
        &[module_entry("net.fabricmc:fabric-loader", "loader.jar")],
        &[module_entry("com.google.code.gson:gson", "gson.jar")],
        "${version_dir}/client.jar",
    )
    .unwrap();
    assert_eq!(
        arms[0].value,
        "loader.jar${classpath_separator}gson.jar${classpath_separator}${version_dir}/client.jar"
    );
    assert!(superseded(
        &[module_entry("net.fabricmc:fabric-loader", "loader.jar")],
        &[],
        "${version_dir}/client.jar"
    )
    .is_empty());
}
