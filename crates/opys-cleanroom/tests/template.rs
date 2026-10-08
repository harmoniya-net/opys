//! Resolving a release end to end: index → document → assets.
//!
//! The document below is a trimmed real one. A Cleanroom document is a
//! complete version JSON, so there is no fold to cover — what these check is
//! that nothing is added to it on the way through: no vanilla version fetched,
//! no library put back, no argument invented.

mod common;

use common::{Reply, TestServer};
use opys_cleanroom::{resolve_cleanroom, CleanroomOptions};
use opys_core::{Val, ValDef};
use serde_json::json;

const FOUNDATION: &str = "top.outlands.foundation.boot.Foundation";
const TAG: &str = "0.6.13-alpha";

fn library(name: &str, path: &str, url: &str) -> serde_json::Value {
    json!({
        "name": name,
        "downloads": { "artifact": { "path": path, "url": url, "sha1": "a".repeat(40), "size": 1000 } },
    })
}

/// A Cleanroom document as the generator publishes it: the game's own
/// downloads, Cleanroom's library list, and the Cleanroom jar addressed at the
/// release's universal asset.
fn document(assets_url: &str) -> serde_json::Value {
    json!({
        "id": format!("1.12.2-Cleanroom-{TAG}"),
        "type": "release",
        "time": "2026-09-12T13:22:40+00:00",
        "releaseTime": "2026-09-12T13:22:40+00:00",
        "minimumLauncherVersion": 18,
        "complianceLevel": 1,
        "javaVersion": { "component": "java-runtime-epsilon", "majorVersion": 25 },
        "mainClass": FOUNDATION,
        "assets": "1.12",
        "assetIndex": {
            "id": "1.12", "sha1": "e".repeat(40), "size": 400, "totalSize": 5000, "url": assets_url,
        },
        "downloads": {
            "client": { "sha1": "f".repeat(40), "size": 10_000_000, "url": "https://piston-data/client.jar" },
        },
        "minecraftArguments": "--username ${auth_player_name} --version ${version_name} --tweakClass net.minecraftforge.fml.common.launcher.FMLTweaker",
        "libraries": [
            library(
                &format!("com.cleanroommc:cleanroom:{TAG}"),
                &format!("com/cleanroommc/cleanroom/{TAG}/cleanroom-{TAG}.jar"),
                &format!("https://github.com/CleanroomMC/Cleanroom/releases/download/{TAG}/cleanroom-{TAG}-universal.jar"),
            ),
            library("org.lwjgl:lwjgl:3.4.1", "org/lwjgl/lwjgl/3.4.1/lwjgl-3.4.1.jar", "https://maven/lwjgl.jar"),
            library("com.mojang:authlib:1.5.25", "com/mojang/authlib/1.5.25/authlib-1.5.25.jar", "https://libraries.minecraft.net/authlib.jar"),
        ],
    })
}

/// One loopback server standing in for the index, the document and the asset
/// index, with every URL rewritten to itself so nothing escapes.
fn site() -> TestServer {
    TestServer::start(move |request| {
        let base = format!("http://{}", request.header("host").unwrap_or_default());
        let target = request.target.as_str();
        let url = format!("{base}/versions/1.12.2/{TAG}.json");

        let body = if target == "/index.json" {
            json!({ "versions": { "1.12.2": {
                "latest": TAG, "latestUrl": url,
                "recommended": TAG, "recommendedUrl": url,
                "best": TAG, "bestUrl": url,
                "builds": [{ "build": TAG, "url": url }],
            }}})
        } else if target.starts_with("/versions/") {
            document(&format!("{base}/assets/1.12.json"))
        } else if target.starts_with("/assets/") {
            json!({ "objects": { "minecraft/sounds/click.ogg": { "hash": "ab".repeat(20), "size": 100 } } })
        } else {
            return Reply::status(404);
        };
        Reply::json(body.to_string())
    })
}

fn options(server: &TestServer, version: &str) -> CleanroomOptions {
    CleanroomOptions {
        version: version.to_owned(),
        source: Some(server.base.clone()),
        libraries: Vec::new(),
    }
}

fn values(val: &Val) -> Vec<String> {
    val.value.clone()
}

fn flat_args(args: &[Val]) -> Vec<String> {
    args.iter().flat_map(|v| v.value.clone()).collect()
}

fn arm_values(vars: &opys_core::ValDefs, key: &str) -> Vec<String> {
    match vars.get(key).expect("var") {
        ValDef::Arms(arms) => arms.iter().map(|a| a.value.clone()).collect(),
        ValDef::Flat(value) => vec![value.clone()],
    }
}

#[test]
fn resolving_walks_the_index_then_the_document_then_its_assets_and_nothing_else() {
    // No Mojang version manifest and no vanilla version JSON: the document
    // inherits from nothing, so there is nothing of vanilla's left to fetch.
    let server = site();
    resolve_cleanroom(&options(&server, "1.12.2")).unwrap();

    assert_eq!(
        server.targets(),
        [
            "/index.json",
            &format!("/versions/1.12.2/{TAG}.json"),
            "/assets/1.12.json",
        ]
    );
}

#[test]
fn the_documents_own_main_class_launches() {
    // No wrapper in front of it: Cleanroom needs no install step, so nothing
    // stands between the launcher and Foundation.
    let server = site();
    let t = resolve_cleanroom(&options(&server, TAG)).unwrap();

    assert_eq!(values(&t.main_class), [FOUNDATION]);
}

#[test]
fn every_library_the_document_lists_becomes_an_artifact_at_its_own_address() {
    let server = site();
    let t = resolve_cleanroom(&options(&server, TAG)).unwrap();

    let jar = t
        .artifacts
        .iter()
        .find(|a| a.path.ends_with(&format!("cleanroom-{TAG}.jar")))
        .expect("the cleanroom jar");
    let encoded = serde_json::to_string(jar).unwrap();
    // It lands at its maven path and comes from the release's universal asset;
    // the two names differ, which is the whole reason the document says both.
    assert!(
        encoded.contains(&format!("cleanroom-{TAG}-universal.jar")),
        "{encoded}"
    );
    assert!(!t.artifacts.iter().any(|a| a.path.contains("installer")));
}

#[test]
fn the_classpath_is_the_documents_list_in_its_order_with_the_client_jar_last() {
    let server = site();
    let t = resolve_cleanroom(&options(&server, TAG)).unwrap();

    let classpath = &arm_values(&t.vars, "classpath")[0];
    let position = |needle: &str| {
        classpath
            .find(needle)
            .unwrap_or_else(|| panic!("{needle} in {classpath}"))
    };
    assert!(position("cleanroom-") < position("lwjgl-3.4.1.jar"));
    assert!(position("lwjgl-3.4.1.jar") < position("authlib-1.5.25.jar"));
    assert!(position("authlib-1.5.25.jar") < position("client.jar"));
}

#[test]
fn nothing_of_vanillas_is_put_back() {
    // LWJGL 2 is the library a fold over vanilla 1.12.2 would leave behind,
    // and the one that breaks Cleanroom when it does.
    let server = site();
    let t = resolve_cleanroom(&options(&server, TAG)).unwrap();

    assert!(!t
        .artifacts
        .iter()
        .any(|a| a.path.contains("org/lwjgl/lwjgl/lwjgl/")));
    assert!(!arm_values(&t.vars, "classpath")[0].contains("org/lwjgl/lwjgl/lwjgl/"));
}

#[test]
fn the_legacy_argument_string_is_the_whole_game_line() {
    let server = site();
    let t = resolve_cleanroom(&options(&server, TAG)).unwrap();

    let game = flat_args(&t.game_args);
    assert_eq!(game.first().map(String::as_str), Some("--username"));
    assert_eq!(
        game.last().map(String::as_str),
        Some("net.minecraftforge.fml.common.launcher.FMLTweaker")
    );
    // A legacy document names no JVM arguments, so the classpath pair is the
    // one the format implies.
    let jvm = flat_args(&t.jvm_args);
    assert!(jvm.contains(&"-cp".to_owned()), "{jvm:?}");
}

#[test]
fn the_classpath_var_carries_the_same_arms_the_template_exposes() {
    let server = site();
    let t = resolve_cleanroom(&options(&server, TAG)).unwrap();

    let arms = arm_values(&t.vars, "classpath");
    assert_eq!(
        arms,
        t.classpath
            .iter()
            .map(|a| a.value.clone())
            .collect::<Vec<_>>()
    );
}

#[test]
fn a_document_that_is_not_a_version_json_is_an_error_not_a_panic() {
    let server = TestServer::start(|request| {
        let base = format!("http://{}", request.header("host").unwrap_or_default());
        let url = format!("{base}/versions/1.12.2/{TAG}.json");
        if request.target == "/index.json" {
            Reply::json(
                json!({ "versions": { "1.12.2": { "builds": [{ "build": TAG, "url": url }] } } })
                    .to_string(),
            )
        } else {
            Reply::json(json!({ "id": "not a version" }).to_string())
        }
    });

    assert!(resolve_cleanroom(&options(&server, TAG)).is_err());
}

#[test]
fn the_template_roundtrips_through_json() {
    // It crosses napi as JSON, so what it serialises to has to be what it
    // deserialises from.
    let server = site();
    let t = resolve_cleanroom(&options(&server, TAG)).unwrap();

    let encoded = serde_json::to_string(&t).unwrap();
    let decoded: opys_cleanroom::CleanroomTemplate = serde_json::from_str(&encoded).unwrap();
    assert_eq!(decoded, t);
}
