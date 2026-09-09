//! The fold: a profile onto the vanilla template it inherits from.

mod common;

use common::{Reply, TestServer};
use opys_core::{Val, ValDef};
use opys_fabric::{profile_to_template, resolve_fabric, FabricOptions, FabricProfile};
use opys_minecraft_vanilla::{client_to_template, MinecraftTemplate};
use opys_mojang::{AssetManifest, Client};
use serde_json::json;

const MC: &str = "1.20.1";
const LOADER: &str = "0.16.10";
const KNOT: &str = "net.fabricmc.loader.impl.launch.knot.KnotClient";

fn version_json(assets_url: &str) -> serde_json::Value {
    json!({
        "id": MC,
        "type": "release",
        "time": "2023-06-12T00:00:00+00:00",
        "releaseTime": "2023-06-12T00:00:00+00:00",
        "minimumLauncherVersion": 21,
        "complianceLevel": 1,
        "javaVersion": { "component": "java-runtime-gamma", "majorVersion": 17 },
        "mainClass": "net.minecraft.client.main.Main",
        "assets": "5",
        "assetIndex": {
            "id": "5",
            "sha1": "e".repeat(40),
            "size": 400,
            "totalSize": 5000,
            "url": assets_url,
        },
        "downloads": {
            "client": { "sha1": "f".repeat(40), "size": 25_000_000, "url": "https://piston-data/client.jar" },
        },
        "arguments": {
            "game": ["--username", "${auth_player_name}"],
            "jvm": ["-Djava.library.path=${natives_directory}", "-cp", "${classpath}"],
        },
        "libraries": [
            {
                "name": "com.google.code.gson:gson:2.10.1",
                "downloads": { "artifact": {
                    "path": "com/google/code/gson/gson/2.10.1/gson-2.10.1.jar",
                    "url": "https://libraries/gson.jar",
                    "sha1": "d".repeat(40),
                    "size": 1000,
                }},
            },
            {
                "name": "org.lwjgl:lwjgl:3.3.1",
                "rules": [{ "action": "allow", "os": { "name": "osx" } }],
                "downloads": { "artifact": {
                    "path": "org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1.jar",
                    "url": "https://libraries/lwjgl.jar",
                    "sha1": "c".repeat(40),
                    "size": 2000,
                }},
            },
        ],
    })
}

fn asset_manifest() -> serde_json::Value {
    json!({ "objects": { "minecraft/sounds/click.ogg": { "hash": "ab".repeat(20), "size": 100 } } })
}

fn profile_json() -> serde_json::Value {
    json!({
        "id": format!("fabric-loader-{LOADER}-{MC}"),
        "inheritsFrom": MC,
        "mainClass": KNOT,
        "arguments": {
            "game": [],
            "jvm": ["-DFabricMcEmu= net.minecraft.client.main.Main "],
        },
        "libraries": [
            { "name": format!("net.fabricmc:fabric-loader:{LOADER}"), "url": "https://maven.fabricmc.net/", "sha1": "a".repeat(40), "size": 2000 },
            { "name": "net.fabricmc:intermediary:1.20.1", "url": "https://maven.fabricmc.net/" },
        ],
    })
}

/// The three pure inputs `profile_to_template` folds together.
fn parts() -> (FabricProfile, Client, MinecraftTemplate) {
    let client = Client::from_version_json(version_json("https://meta/assets/5.json")).unwrap();
    let assets: AssetManifest = serde_json::from_value(asset_manifest()).unwrap();
    let vanilla = client_to_template(&client, &assets).unwrap();
    let profile: FabricProfile = serde_json::from_value(profile_json()).unwrap();
    (profile, client, vanilla)
}

fn values(val: &Val) -> Vec<String> {
    val.value.clone()
}

fn arm_values(vars: &opys_core::ValDefs, key: &str) -> Vec<String> {
    match vars.get(key).expect("var") {
        ValDef::Arms(arms) => arms.iter().map(|a| a.value.clone()).collect(),
        ValDef::Flat(value) => vec![value.clone()],
    }
}

#[test]
fn the_loader_libraries_are_appended_after_the_vanilla_artifacts() {
    let (profile, client, vanilla) = parts();
    let t = profile_to_template(&profile, &client, &vanilla).unwrap();

    assert_eq!(
        t.artifacts[..vanilla.artifacts.len()],
        vanilla.artifacts[..]
    );
    let tail: Vec<&str> = t.artifacts[vanilla.artifacts.len()..]
        .iter()
        .map(|a| a.path.as_str())
        .collect();
    assert_eq!(
        tail,
        [
            "${library_directory}/net/fabricmc/fabric-loader/0.16.10/fabric-loader-0.16.10.jar",
            "${library_directory}/net/fabricmc/intermediary/1.20.1/intermediary-1.20.1.jar",
        ]
    );
}

#[test]
fn the_main_class_is_the_profiles_not_vanillas() {
    let (profile, client, vanilla) = parts();
    let t = profile_to_template(&profile, &client, &vanilla).unwrap();

    assert_eq!(values(&t.main_class), [KNOT]);
    assert_eq!(
        values(&vanilla.main_class),
        ["net.minecraft.client.main.Main"]
    );
}

#[test]
fn the_profiles_jvm_args_are_merged_after_vanillas() {
    let (profile, client, vanilla) = parts();
    let t = profile_to_template(&profile, &client, &vanilla).unwrap();

    let jvm: Vec<String> = t.jvm_args.iter().flat_map(values).collect();
    assert_eq!(
        jvm,
        [
            "-Djava.library.path=${natives_directory}",
            "-cp",
            "${classpath}",
            "-DFabricMcEmu= net.minecraft.client.main.Main ",
        ]
    );
    let game: Vec<String> = t.game_args.iter().flat_map(values).collect();
    assert_eq!(game, ["--username", "${auth_player_name}"]);
}

#[test]
fn every_os_arm_carries_the_loader_libraries_unconditionally() {
    let (profile, client, vanilla) = parts();
    let t = profile_to_template(&profile, &client, &vanilla).unwrap();

    assert_eq!(t.classpath.len(), 3);
    for arm in &t.classpath {
        assert!(arm.value.contains("net/fabricmc/fabric-loader/0.16.10"));
        assert!(arm.value.contains("net/fabricmc/intermediary/1.20.1"));
        // Vanilla's rules still gate vanilla's libraries.
        assert!(arm.value.contains("com/google/code/gson"));
    }
}

#[test]
fn the_loader_libraries_come_before_the_vanilla_ones_on_the_classpath() {
    // What `inheritsFrom` means: the patch's libraries are ahead of the base
    // version's. Fabric ships its own ASM build, and order is the only thing
    // that would make the JVM prefer it over a vanilla copy of the same class.
    let (profile, client, vanilla) = parts();
    let t = profile_to_template(&profile, &client, &vanilla).unwrap();

    let linux = &t.classpath[0].value;
    let gson = linux.find("com/google/code/gson").unwrap();
    let loader = linux.find("net/fabricmc/fabric-loader").unwrap();
    assert!(loader < gson);
    assert!(linux.starts_with("${version_dir}/client.jar"));
}

#[test]
fn an_os_gated_vanilla_library_stays_gated_under_fabric() {
    let (profile, client, vanilla) = parts();
    let t = profile_to_template(&profile, &client, &vanilla).unwrap();

    // build_classpath orders the arms linux, windows, osx.
    assert!(!t.classpath[0].value.contains("org/lwjgl/lwjgl"));
    assert!(!t.classpath[1].value.contains("org/lwjgl/lwjgl"));
    assert!(t.classpath[2].value.contains("org/lwjgl/lwjgl"));
}

#[test]
fn the_classpath_var_is_replaced_and_the_rest_of_vanillas_vars_kept() {
    let (profile, client, vanilla) = parts();
    let t = profile_to_template(&profile, &client, &vanilla).unwrap();

    assert_eq!(
        arm_values(&t.vars, "classpath"),
        t.classpath
            .iter()
            .map(|a| a.value.clone())
            .collect::<Vec<_>>()
    );
    assert_ne!(
        arm_values(&t.vars, "classpath"),
        arm_values(&vanilla.vars, "classpath")
    );
    assert_eq!(arm_values(&t.vars, "version_name"), [MC]);
    assert_eq!(arm_values(&t.vars, "assets_index_name"), ["5"]);
}

#[test]
fn the_launch_is_the_decomposed_parts_in_order() {
    let (profile, client, vanilla) = parts();
    let t = profile_to_template(&profile, &client, &vanilla).unwrap();

    assert_eq!(t.launch.command, "${java_bin}");
    let expected: Vec<Val> = [
        t.jvm_args.clone(),
        vec![t.main_class.clone()],
        t.game_args.clone(),
    ]
    .concat();
    assert_eq!(t.launch.args, expected);
}

#[test]
fn the_template_roundtrips_through_json() {
    let (profile, client, vanilla) = parts();
    let t = profile_to_template(&profile, &client, &vanilla).unwrap();

    let encoded = serde_json::to_string(&t).unwrap();
    assert_eq!(
        serde_json::from_str::<opys_fabric::FabricTemplate>(&encoded).unwrap(),
        t
    );
}

// ──────────────────────────────────────────────────────────────────────────
// The impure half, against one loopback server standing in for both APIs.
// ──────────────────────────────────────────────────────────────────────────

/// Serve Fabric Meta and the Mojang chain, with every URL either document
/// points at rewritten to this server so nothing escapes to the real APIs.
fn both_apis() -> TestServer {
    TestServer::start(move |request| {
        let base = format!("http://{}", request.header("host").unwrap_or_default());
        let target = request.target.as_str();
        let body = if target.ends_with("/profile/json") {
            profile_json()
        } else if target.starts_with("/v2/versions/loader/") {
            json!([{ "loader": { "version": LOADER, "stable": true } }])
        } else if target.starts_with("/versions/") {
            version_json(&format!("{base}/assets/5.json"))
        } else if target.starts_with("/assets/") {
            asset_manifest()
        } else {
            json!({
                "latest": { "release": MC, "snapshot": MC },
                "versions": [{
                    "id": MC,
                    "type": "release",
                    "url": format!("{base}/versions/{MC}.json"),
                    "time": "2023-06-12T00:00:00+00:00",
                    "releaseTime": "2023-06-12T00:00:00+00:00",
                    "sha1": "a".repeat(40),
                    "complianceLevel": 1,
                }],
            })
        };
        Reply::json(body.to_string())
    })
}

fn options(server: &TestServer, loader: Option<&str>) -> FabricOptions {
    FabricOptions {
        version: MC.to_owned(),
        loader: loader.map(str::to_owned),
        source: Some(server.base.clone()),
        manifest_base: Some(format!("{}/version_manifest_v2.json", server.base)),
    }
}

#[test]
fn resolving_walks_meta_then_the_mojang_chain() {
    let server = both_apis();
    let t = resolve_fabric(&options(&server, Some(LOADER))).unwrap();

    assert_eq!(values(&t.main_class), [KNOT]);
    assert_eq!(
        server.targets(),
        [
            format!("/v2/versions/loader/{MC}/{LOADER}/profile/json"),
            "/version_manifest_v2.json".to_owned(),
            format!("/versions/{MC}.json"),
            "/assets/5.json".to_owned(),
        ]
    );
}

#[test]
fn an_unpinned_loader_asks_meta_for_the_build_list_first() {
    let server = both_apis();
    resolve_fabric(&options(&server, None)).unwrap();

    assert_eq!(server.targets()[0], format!("/v2/versions/loader/{MC}"));
}

#[test]
fn resolving_and_folding_by_hand_reach_the_same_template() {
    let server = both_apis();
    let resolved = resolve_fabric(&options(&server, Some(LOADER))).unwrap();

    let (profile, client, vanilla) = parts();
    let mut folded = profile_to_template(&profile, &client, &vanilla).unwrap();
    // `parts()` pins the asset-index URL; the server rewrites it to itself.
    folded.artifacts = resolved.artifacts.clone();
    assert_eq!(resolved, folded);
}

#[test]
fn a_failed_profile_fetch_carries_the_url_and_the_status() {
    let server = TestServer::start(|request| {
        if request.target.ends_with("/profile/json") {
            Reply::status(404)
        } else {
            Reply::json("[]")
        }
    });
    let err = resolve_fabric(&options(&server, Some(LOADER))).unwrap_err();

    assert!(err.to_string().contains("404"));
    assert!(err.to_string().contains("/profile/json"));
}

#[test]
fn the_contribution_exposes_the_launch_groups_a_config_wires() {
    let server = both_apis();
    let output = opys_fabric::build_fabric(&options(&server, Some(LOADER))).unwrap();
    let template = resolve_fabric(&options(&server, Some(LOADER))).unwrap();

    assert_eq!(output.name, "fabric");
    let mut groups: Vec<&str> = output
        .contribution
        .launch
        .keys()
        .map(String::as_str)
        .collect();
    groups.sort_unstable();
    assert_eq!(groups, ["command", "gameArgs", "jvmArgs", "mainClass"]);
    assert_eq!(output.contribution.artifacts, template.artifacts);
    assert_eq!(output.contribution.vars, template.vars);
    assert!(output.contribution.envs.is_empty());
}
