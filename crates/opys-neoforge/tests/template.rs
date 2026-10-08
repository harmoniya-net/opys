//! Resolving a build end to end: index → document → vanilla → fold.
//!
//! The documents below are trimmed real ones. NeoForge has only ever installed
//! one way, so unlike Forge there are no eras to line up here — what these
//! cover is the fold: which libraries win, what order they go in, and that the
//! wrapper's properties survive intact.

mod common;

use common::{Reply, TestServer};
use opys_core::{Val, ValDef};
use opys_neoforge::{resolve_neoforge, NeoForgeOptions};
use serde_json::json;

const HORNO_MAIN: &str = "net.harmoniya.horno.Main";

fn artifact(path: &str, url: &str) -> serde_json::Value {
    json!({ "path": path, "url": url, "sha1": "a".repeat(40), "size": 1000 })
}

fn library(name: &str, path: &str) -> serde_json::Value {
    json!({ "name": name, "downloads": { "artifact": artifact(path, "https://maven/x.jar") } })
}

fn version_json(mc: &str, assets_url: &str) -> serde_json::Value {
    json!({
        "id": mc,
        "type": "release",
        "time": "2024-08-08T00:00:00+00:00",
        "releaseTime": "2024-08-08T00:00:00+00:00",
        "minimumLauncherVersion": 21,
        "complianceLevel": 1,
        "javaVersion": { "component": "java-runtime-delta", "majorVersion": 21 },
        "mainClass": "net.minecraft.client.main.Main",
        "assets": "17",
        "assetIndex": {
            "id": "17", "sha1": "e".repeat(40), "size": 400, "totalSize": 5000, "url": assets_url,
        },
        "downloads": {
            "client": { "sha1": "f".repeat(40), "size": 25_000_000, "url": "https://piston-data/client.jar" },
        },
        "libraries": [
            library("com.google.code.gson:gson:2.10.1", "com/google/code/gson/gson/2.10.1/gson-2.10.1.jar"),
            // NeoForge pins its own ASM, so this one is superseded rather than
            // left sitting behind it.
            library("org.ow2.asm:asm:9.6", "org/ow2/asm/asm/9.6/asm-9.6.jar"),
        ],
        "arguments": {
            "game": ["--username", "${auth_player_name}"],
            "jvm": ["-Djava.library.path=${natives_directory}", "-cp", "${classpath}"],
        },
    })
}

/// A NeoForge document as the generator publishes it: the loader's own
/// libraries, then the client jar and horno.
///
/// The installer is not among them. It is an input to horno rather than a
/// runtime library, so it is named by properties and horno fetches it — which
/// is also what keeps it off `-cp`, where it collides with the loader's own
/// module and shadows the game's Gson.
fn document(mc: &str, neoforge: &str) -> serde_json::Value {
    json!({
        "id": format!("neoforge-{neoforge}"),
        "inheritsFrom": mc,
        "type": "release",
        "mainClass": HORNO_MAIN,
        "arguments": {
            "game": ["--fml.neoForgeVersion", neoforge, "--fml.mcVersion", mc, "--launchTarget", "forgeclient"],
            "jvm": [
                "-Dhorno.librariesDir=${library_directory}",
                format!("-Dhorno.installer=${{library_directory}}/net/neoforged/neoforge/{neoforge}/neoforge-{neoforge}-installer.jar"),
                format!("-Dhorno.installerUrl=https://maven/neoforge-{neoforge}-installer.jar"),
                format!("-Dhorno.installerSha1={}", "b".repeat(40)),
                format!("-Dhorno.minecraft=${{library_directory}}/com/mojang/minecraft/{mc}/minecraft-{mc}-client.jar"),
                "-DlibraryDirectory=${library_directory}",
            ],
        },
        "libraries": [
            library("net.neoforged.fancymodloader:loader:4.0.39", "net/neoforged/fancymodloader/loader/4.0.39/loader-4.0.39.jar"),
            library("org.ow2.asm:asm:9.7", "org/ow2/asm/asm/9.7/asm-9.7.jar"),
            library(&format!("com.mojang:minecraft:{mc}:client"), &format!("com/mojang/minecraft/{mc}/minecraft-{mc}-client.jar")),
            library("net.harmoniya:horno:0.1.0", "net/harmoniya/horno/0.1.0/horno-0.1.0.jar"),
        ],
    })
}

/// One loopback server standing in for the index, the documents and the Mojang
/// chain, with every URL rewritten to itself so nothing escapes.
fn site() -> TestServer {
    TestServer::start(move |request| {
        let base = format!("http://{}", request.header("host").unwrap_or_default());
        let target = request.target.as_str();

        let body = if target == "/index.json" {
            let entry = |mc: &str, neoforge: &str| {
                json!({
                    "latest": neoforge,
                    "latestUrl": format!("{base}/versions/{mc}/{neoforge}.json"),
                    "recommended": neoforge,
                    "recommendedUrl": format!("{base}/versions/{mc}/{neoforge}.json"),
                    "best": neoforge,
                    "bestUrl": format!("{base}/versions/{mc}/{neoforge}.json"),
                    "builds": [{ "build": neoforge, "url": format!("{base}/versions/{mc}/{neoforge}.json") }],
                })
            };
            json!({ "versions": {
                "1.21.1": entry("1.21.1", "21.1.172"),
                "26.2": entry("26.2", "26.2.0.84"),
            }})
        } else if target.starts_with("/versions/1.21.1/") {
            document("1.21.1", "21.1.172")
        } else if target.starts_with("/versions/26.2/") {
            document("26.2", "26.2.0.84")
        } else if target.starts_with("/mojang/") {
            let mc = target
                .trim_start_matches("/mojang/")
                .trim_end_matches(".json");
            version_json(mc, &format!("{base}/assets/17.json"))
        } else if target.starts_with("/assets/") {
            json!({ "objects": { "minecraft/sounds/click.ogg": { "hash": "ab".repeat(20), "size": 100 } } })
        } else {
            let version = |mc: &str| {
                json!({
                    "id": mc, "type": "release",
                    "url": format!("{base}/mojang/{mc}.json"),
                    "time": "2024-08-08T00:00:00+00:00",
                    "releaseTime": "2024-08-08T00:00:00+00:00",
                    "sha1": "a".repeat(40), "complianceLevel": 1,
                })
            };
            json!({
                "latest": { "release": "26.2", "snapshot": "26.3-pre-3" },
                "versions": [version("1.21.1"), version("26.2")],
            })
        };
        Reply::json(body.to_string())
    })
}

fn options(server: &TestServer, version: &str) -> NeoForgeOptions {
    NeoForgeOptions {
        version: version.to_owned(),
        source: Some(server.base.clone()),
        manifest_base: Some(format!("{}/version_manifest_v2.json", server.base)),
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
fn resolving_walks_the_index_then_the_document_then_the_mojang_chain() {
    let server = site();
    resolve_neoforge(&options(&server, "1.21.1")).unwrap();

    assert_eq!(
        server.targets(),
        [
            "/index.json",
            "/versions/1.21.1/21.1.172.json",
            "/version_manifest_v2.json",
            "/mojang/1.21.1.json",
            "/assets/17.json",
        ]
    );
}

#[test]
fn the_wrapper_launches_rather_than_the_class_the_document_would_have_named() {
    let server = site();
    let t = resolve_neoforge(&options(&server, "1.21.1")).unwrap();

    assert_eq!(values(&t.main_class), [HORNO_MAIN]);
}

#[test]
fn a_minecraft_version_with_no_leading_one_resolves_like_any_other() {
    // Nothing in the fold parses a version; it reads `inheritsFrom` and
    // fetches what it says.
    let server = site();
    let t = resolve_neoforge(&options(&server, "26.2")).unwrap();

    assert_eq!(values(&t.main_class), [HORNO_MAIN]);
    // `26.2` is the Minecraft version the build id `26.2.0.84` inherits from,
    // and the only place that pairing is written down is the index.
    assert!(t.classpath[0].value.contains("minecraft-26.2-client.jar"));
    let jvm = flat_args(&t.jvm_args);
    assert!(
        jvm.iter()
            .any(|a| a.contains("neoforge-26.2.0.84-installer.jar")),
        "{jvm:?}"
    );
}

#[test]
fn neoforge_libraries_come_before_the_vanilla_ones() {
    let server = site();
    let t = resolve_neoforge(&options(&server, "1.21.1")).unwrap();

    let linux = &t.classpath[0].value;
    let loader = linux.find("loader-4.0.39.jar").expect("loader jar");
    let vanilla = linux.find("gson-2.10.1.jar").expect("vanilla gson");
    assert!(loader < vanilla, "{linux}");
}

#[test]
fn the_documents_own_client_jar_replaces_the_one_the_launcher_would_have_added() {
    // Every NeoForge document declares `com.mojang:minecraft:<mc>:client` as a
    // library, because that is how horno is told where the jar is. It
    // supersedes `${version_dir}/client.jar` rather than joining it: two
    // copies of the vanilla client on `-cp` is what `Module minecraft contains
    // package com.mojang.blaze3d.systems` means.
    let server = site();
    let t = resolve_neoforge(&options(&server, "1.21.1")).unwrap();

    let linux = &t.classpath[0].value;
    assert!(!linux.contains("${version_dir}/client.jar"), "{linux}");
    assert_eq!(
        linux.matches("minecraft-1.21.1-client.jar").count(),
        1,
        "{linux}"
    );
}

#[test]
fn a_vanilla_library_neoforge_pins_itself_is_dropped_rather_than_left_behind() {
    // NeoForge ships ASM 9.7 where 1.21.1 ships 9.6. Leaving 9.6 on `-cp`
    // behind it would download and mount a jar nothing opens.
    let server = site();
    let t = resolve_neoforge(&options(&server, "1.21.1")).unwrap();

    let linux = &t.classpath[0].value;
    assert!(linux.contains("asm-9.7.jar"), "{linux}");
    assert!(!linux.contains("asm-9.6.jar"), "{linux}");

    let paths: Vec<&str> = t.artifacts.iter().map(|a| a.path.as_str()).collect();
    assert!(
        !paths.iter().any(|p| p.contains("asm-9.6.jar")),
        "{paths:?}"
    );
}

#[test]
fn the_installer_is_named_by_properties_and_never_becomes_an_artifact() {
    // It is horno's input, not the game's dependency. Declaring it a library
    // was what put it on `-cp`, where `neoforge-<version>-installer.jar`
    // becomes an automatic module named `neoforge` — the same name FML gives
    // its own jar — and where its shaded Gson shadows the game's.
    let server = site();
    let t = resolve_neoforge(&options(&server, "1.21.1")).unwrap();

    let paths: Vec<&str> = t.artifacts.iter().map(|a| a.path.as_str()).collect();
    assert!(
        !paths.iter().any(|p| p.contains("installer.jar")),
        "{paths:?}",
    );
    assert!(
        paths.iter().any(|p| p.ends_with("horno-0.1.0.jar")),
        "{paths:?}",
    );

    let jvm = flat_args(&t.jvm_args);
    for property in [
        "-Dhorno.installer=",
        "-Dhorno.installerUrl=",
        "-Dhorno.installerSha1=",
    ] {
        assert!(jvm.iter().any(|a| a.starts_with(property)), "{jvm:?}");
    }
}

#[test]
fn the_horno_properties_reach_the_jvm_line_ahead_of_the_documents_own() {
    let server = site();
    let t = resolve_neoforge(&options(&server, "1.21.1")).unwrap();

    let jvm = flat_args(&t.jvm_args);
    let librariesdir = jvm
        .iter()
        .position(|a| a.starts_with("-Dhorno.librariesDir="))
        .expect("librariesDir");
    let installer = jvm
        .iter()
        .position(|a| a.starts_with("-Dhorno.installer="))
        .expect("installer");
    let minecraft = jvm
        .iter()
        .position(|a| a.starts_with("-Dhorno.minecraft="))
        .expect("minecraft");
    assert!(librariesdir < installer && installer < minecraft, "{jvm:?}");
    // Vanilla's jvm line comes first and stays whole.
    assert!(jvm.contains(&"-cp".to_owned()), "{jvm:?}");
}

#[test]
fn game_args_append_to_vanillas_rather_than_replacing_them() {
    let server = site();
    let t = resolve_neoforge(&options(&server, "1.21.1")).unwrap();

    let game = flat_args(&t.game_args);
    assert_eq!(game.first().map(String::as_str), Some("--username"));
    assert!(
        game.contains(&"--fml.neoForgeVersion".to_owned()),
        "{game:?}"
    );
    assert!(game.contains(&"forgeclient".to_owned()), "{game:?}");
}

#[test]
fn the_classpath_var_carries_the_same_arms_the_template_exposes() {
    let server = site();
    let t = resolve_neoforge(&options(&server, "1.21.1")).unwrap();

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
fn the_template_roundtrips_through_json() {
    // It crosses napi as JSON, so what it serialises to has to be what it
    // deserialises from.
    let server = site();
    let t = resolve_neoforge(&options(&server, "1.21.1")).unwrap();

    let encoded = serde_json::to_string(&t).unwrap();
    let decoded: opys_neoforge::NeoForgeTemplate = serde_json::from_str(&encoded).unwrap();
    assert_eq!(decoded, t);
}
