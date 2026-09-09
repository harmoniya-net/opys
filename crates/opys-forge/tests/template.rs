//! Resolving a build end to end: index → document → vanilla → fold.
//!
//! The three documents below are trimmed real ones, chosen because they are
//! what used to force the loader to branch: a 1.20.1 processor build, a
//! 1.12.2 LaunchWrapper build, and a 1.5.2 jar-mod build. The point of these
//! tests is that the code path through them is identical.

mod common;

use common::{Reply, TestServer};
use opys_core::{Val, ValDef};
use opys_forge::{resolve_forge, ForgeOptions};
use serde_json::json;

const WRAPPER_MAIN: &str = "io.github.zekerzhayard.forgewrapper.installer.Main";

fn artifact(path: &str, url: &str) -> serde_json::Value {
    json!({ "path": path, "url": url, "sha1": "a".repeat(40), "size": 1000 })
}

fn library(name: &str, path: &str) -> serde_json::Value {
    json!({ "name": name, "downloads": { "artifact": artifact(path, "https://maven/x.jar") } })
}

fn version_json(mc: &str, assets_url: &str, legacy_args: bool) -> serde_json::Value {
    let mut raw = json!({
        "id": mc,
        "type": "release",
        "time": "2023-06-12T00:00:00+00:00",
        "releaseTime": "2023-06-12T00:00:00+00:00",
        "minimumLauncherVersion": 21,
        "complianceLevel": 1,
        "javaVersion": { "component": "java-runtime-gamma", "majorVersion": 17 },
        "mainClass": "net.minecraft.client.main.Main",
        "assets": "5",
        "assetIndex": {
            "id": "5", "sha1": "e".repeat(40), "size": 400, "totalSize": 5000, "url": assets_url,
        },
        "downloads": {
            "client": { "sha1": "f".repeat(40), "size": 25_000_000, "url": "https://piston-data/client.jar" },
        },
        "libraries": [
            library("com.google.code.gson:gson:2.10.1", "com/google/code/gson/gson/2.10.1/gson-2.10.1.jar"),
            library("org.ow2.asm:asm-all:4.1", "org/ow2/asm/asm-all/4.1/asm-all-4.1.jar"),
        ],
    });
    let args = if legacy_args {
        json!({ "minecraftArguments": "--username ${auth_player_name} --version ${version_name}" })
    } else {
        json!({ "arguments": {
            "game": ["--username", "${auth_player_name}"],
            "jvm": ["-Djava.library.path=${natives_directory}", "-cp", "${classpath}"],
        }})
    };
    let object = raw.as_object_mut().unwrap();
    for (key, value) in args.as_object().unwrap() {
        object.insert(key.clone(), value.clone());
    }
    raw
}

/// 1.13+: the wrapper runs Forge's installer processors at launch.
fn processor_document() -> serde_json::Value {
    json!({
        "id": "1.20.1-forge-47.4.10",
        "inheritsFrom": "1.20.1",
        "mainClass": WRAPPER_MAIN,
        "arguments": {
            "game": ["--launchTarget", "forgeclient"],
            "jvm": [
                "-Dforgewrapper.librariesDir=${library_directory}",
                "-DlibraryDirectory=${library_directory}",
            ],
        },
        "libraries": [
            library("cpw.mods:securejarhandler:2.1.10", "cpw/mods/securejarhandler/2.1.10/securejarhandler-2.1.10.jar"),
            library("com.mojang:minecraft:1.20.1:client", "com/mojang/minecraft/1.20.1/minecraft-1.20.1-client.jar"),
        ],
    })
}

/// 1.6.1–1.12.2: no installer at launch, a LaunchWrapper tweaker instead.
fn legacy_document() -> serde_json::Value {
    json!({
        "id": "1.12.2-forge-14.23.5.2860",
        "inheritsFrom": "1.12.2",
        "mainClass": "net.minecraft.launchwrapper.Launch",
        "minecraftArguments": "--username ${auth_player_name} --tweakClass net.minecraftforge.fml.common.launcher.FMLTweaker",
        "libraries": [
            library("net.minecraftforge:forge:1.12.2-14.23.5.2860", "net/minecraftforge/forge/1.12.2-14.23.5.2860/forge-1.12.2-14.23.5.2860.jar"),
            library("org.ow2.asm:asm-all:5.2", "org/ow2/asm/asm-all/5.2/asm-all-5.2.jar"),
        ],
    })
}

/// 1.5.2 and older: the client jar itself is rewritten, and the document
/// carries both argument fields at once.
fn jarmod_document() -> serde_json::Value {
    json!({
        "id": "1.5.2-Forge7.8.1.738",
        "inheritsFrom": "1.5.2",
        "mainClass": WRAPPER_MAIN,
        "arguments": { "jvm": [
            "-Dforgewrapper.mainClass=net.minecraft.launchwrapper.Launch",
            "-Dforgewrapper.patched=${library_directory}/net/minecraftforge/forge/1.5.2-7.8.1.738/forge-1.5.2-7.8.1.738-patched-client.jar",
        ]},
        "minecraftArguments": "${auth_player_name} --tweakClass net.minecraftforge.legacy._1_5_2.LibraryFixerTweaker",
        "libraries": [
            library("com.mojang:minecraft:1.5.2:client", "com/mojang/minecraft/1.5.2/minecraft-1.5.2-client.jar"),
            library("net.minecraftforge:minecraftforge:7.8.1.738", "net/minecraftforge/minecraftforge/7.8.1.738/minecraftforge-7.8.1.738.jar"),
        ],
    })
}

/// One loopback server standing in for the document index, the documents and
/// the Mojang chain, with every URL rewritten to itself so nothing escapes.
fn site() -> TestServer {
    TestServer::start(move |request| {
        let base = format!("http://{}", request.header("host").unwrap_or_default());
        let target = request.target.as_str();

        let body = if target == "/index.json" {
            let entry = |mc: &str, forge: &str| {
                json!({
                    "latest": forge,
                    "latestUrl": format!("{base}/versions/{mc}/{forge}.json"),
                    "recommended": forge,
                    "recommendedUrl": format!("{base}/versions/{mc}/{forge}.json"),
                    "best": forge,
                    "bestUrl": format!("{base}/versions/{mc}/{forge}.json"),
                    "builds": [{ "forge": forge, "url": format!("{base}/versions/{mc}/{forge}.json") }],
                })
            };
            json!({ "versions": {
                "1.20.1": entry("1.20.1", "1.20.1-47.4.10"),
                "1.12.2": entry("1.12.2", "1.12.2-14.23.5.2860"),
                "1.5.2": entry("1.5.2", "1.5.2-7.8.1.738"),
            }})
        } else if target.starts_with("/versions/1.20.1/") {
            processor_document()
        } else if target.starts_with("/versions/1.12.2/") {
            legacy_document()
        } else if target.starts_with("/versions/1.5.2/") {
            jarmod_document()
        } else if target.starts_with("/mojang/") {
            let mc = target
                .trim_start_matches("/mojang/")
                .trim_end_matches(".json");
            version_json(mc, &format!("{base}/assets/5.json"), mc != "1.20.1")
        } else if target.starts_with("/assets/") {
            json!({ "objects": { "minecraft/sounds/click.ogg": { "hash": "ab".repeat(20), "size": 100 } } })
        } else {
            let version = |mc: &str| {
                json!({
                    "id": mc, "type": "release",
                    "url": format!("{base}/mojang/{mc}.json"),
                    "time": "2023-06-12T00:00:00+00:00",
                    "releaseTime": "2023-06-12T00:00:00+00:00",
                    "sha1": "a".repeat(40), "complianceLevel": 1,
                })
            };
            json!({
                "latest": { "release": "1.20.1", "snapshot": "1.20.1" },
                "versions": [version("1.20.1"), version("1.12.2"), version("1.5.2")],
            })
        };
        Reply::json(body.to_string())
    })
}

fn options(server: &TestServer, version: &str) -> ForgeOptions {
    ForgeOptions {
        version: version.to_owned(),
        source: Some(server.base.clone()),
        manifest_base: Some(format!("{}/version_manifest_v2.json", server.base)),
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
    resolve_forge(&options(&server, "1.20.1")).unwrap();

    assert_eq!(
        server.targets(),
        [
            "/index.json",
            "/versions/1.20.1/1.20.1-47.4.10.json",
            "/version_manifest_v2.json",
            "/mojang/1.20.1.json",
            "/assets/5.json",
        ]
    );
}

#[test]
fn every_era_goes_through_the_same_path() {
    // The whole point of the published documents. Three builds that used to
    // need three code paths — run the processors, hand off to LaunchWrapper,
    // rewrite the client jar — resolve through one.
    let server = site();
    for (version, main_class) in [
        ("1.20.1", WRAPPER_MAIN),
        ("1.12.2", "net.minecraft.launchwrapper.Launch"),
        ("1.5.2", WRAPPER_MAIN),
    ] {
        let t = resolve_forge(&options(&server, version)).unwrap();
        assert_eq!(values(&t.main_class), [main_class], "{version}");
        assert_eq!(t.classpath.len(), 3, "{version}");
        assert!(!t.artifacts.is_empty(), "{version}");
    }
}

#[test]
fn forge_libraries_come_before_the_vanilla_ones_on_the_classpath() {
    let server = site();
    let t = resolve_forge(&options(&server, "1.12.2")).unwrap();

    let linux = &t.classpath[0].value;
    let forge_lib = linux.find("forge-1.12.2-14.23.5.2860.jar").expect("forge jar");
    let vanilla_lib = linux.find("gson-2.10.1.jar").expect("vanilla gson");
    assert!(forge_lib < vanilla_lib);
    // And the client jar is last, where every launcher that reads the format
    // puts it.
    assert!(linux.ends_with("${version_dir}/client.jar"));
}

#[test]
fn a_vanilla_library_forge_replaces_leaves_the_classpath_entirely() {
    // Forge ships ASM 5.2 where vanilla ships 4.1. Leaving 4.1 behind it
    // would be a jar downloaded, verified and put on `-cp` to be ignored —
    // and still findable by anything that scans the classpath itself.
    let server = site();
    let t = resolve_forge(&options(&server, "1.12.2")).unwrap();

    for arm in &t.classpath {
        assert!(arm.value.contains("asm-all/5.2"), "{}", arm.value);
        assert!(!arm.value.contains("asm-all/4.1"), "{}", arm.value);
    }
    let paths: Vec<&str> = t.artifacts.iter().map(|a| a.path.as_str()).collect();
    // …and it is not downloaded either.
    assert!(!paths.iter().any(|p| p.contains("asm-all/4.1")), "{paths:?}");
    assert!(paths.iter().any(|p| p.contains("asm-all/5.2")));
}

#[test]
fn forge_artifacts_are_appended_to_the_vanilla_ones() {
    let server = site();
    let t = resolve_forge(&options(&server, "1.12.2")).unwrap();

    let paths: Vec<&str> = t.artifacts.iter().map(|a| a.path.as_str()).collect();
    assert_eq!(paths[0], "${version_dir}/client.jar");
    assert!(paths.contains(
        &"${library_directory}/net/minecraftforge/forge/1.12.2-14.23.5.2860/forge-1.12.2-14.23.5.2860.jar"
    ));
}

#[test]
fn a_legacy_document_replaces_the_game_arguments_rather_than_extending_them() {
    let server = site();
    let t = resolve_forge(&options(&server, "1.12.2")).unwrap();

    let game = flat_args(&t.game_args);
    assert!(game.contains(&"--tweakClass".to_owned()));
    // Vanilla 1.12.2's own line ends at `--version ${version_name}`; Forge's
    // replaces it, so that argument is gone rather than present twice.
    assert!(!game.contains(&"--version".to_owned()), "{game:?}");
    assert_eq!(game.iter().filter(|a| *a == "--username").count(), 1);
}

#[test]
fn a_jarmod_document_keeps_both_of_its_argument_fields() {
    // 1.5.2 carries wrapper properties under `arguments.jvm` and its tweak
    // class under `minecraftArguments`. Losing either one means the game does
    // not start.
    let server = site();
    let t = resolve_forge(&options(&server, "1.5.2")).unwrap();

    let jvm = flat_args(&t.jvm_args);
    assert!(jvm
        .iter()
        .any(|a| a.starts_with("-Dforgewrapper.mainClass=")));
    assert!(jvm.iter().any(|a| a.starts_with("-Dforgewrapper.patched=")));

    let game = flat_args(&t.game_args);
    assert!(game.contains(&"net.minecraftforge.legacy._1_5_2.LibraryFixerTweaker".to_owned()));
}

#[test]
fn a_processor_document_appends_its_arguments_to_vanillas() {
    let server = site();
    let t = resolve_forge(&options(&server, "1.20.1")).unwrap();

    let jvm = flat_args(&t.jvm_args);
    assert_eq!(
        jvm.first().map(String::as_str),
        Some("-Djava.library.path=${natives_directory}")
    );
    assert!(jvm.contains(&"-Dforgewrapper.librariesDir=${library_directory}".to_owned()));

    let game = flat_args(&t.game_args);
    assert_eq!(
        game,
        [
            "--username",
            "${auth_player_name}",
            "--launchTarget",
            "forgeclient"
        ]
    );
}

#[test]
fn the_vanilla_client_jar_declared_as_a_library_is_fetched_as_one() {
    // The wrapper has to be told where that jar is, and the format has no
    // placeholder for it, so the document declares it as a library. That is a
    // second copy of the same file, on purpose — see the generator's README.
    let server = site();
    let t = resolve_forge(&options(&server, "1.5.2")).unwrap();

    let paths: Vec<&str> = t.artifacts.iter().map(|a| a.path.as_str()).collect();
    assert!(paths.contains(&"${version_dir}/client.jar"));
    assert!(paths
        .contains(&"${library_directory}/com/mojang/minecraft/1.5.2/minecraft-1.5.2-client.jar"));
}

#[test]
fn the_classpath_var_is_replaced_and_the_rest_of_vanillas_vars_kept() {
    let server = site();
    let t = resolve_forge(&options(&server, "1.20.1")).unwrap();

    assert_eq!(
        arm_values(&t.vars, "classpath"),
        t.classpath
            .iter()
            .map(|a| a.value.clone())
            .collect::<Vec<_>>()
    );
    assert_eq!(arm_values(&t.vars, "assets_index_name"), ["5"]);
    assert_eq!(
        arm_values(&t.vars, "library_directory"),
        ["${root}/libraries"]
    );
}

#[test]
fn the_template_roundtrips_through_json() {
    let server = site();
    let t = resolve_forge(&options(&server, "1.20.1")).unwrap();

    let encoded = serde_json::to_string(&t).unwrap();
    assert_eq!(
        serde_json::from_str::<opys_forge::ForgeTemplate>(&encoded).unwrap(),
        t
    );
}
