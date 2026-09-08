//! `client_to_template` — the pure half every loader in the family reuses.

use opys_core::{Source, ValDef};
use opys_minecraft_vanilla::client_to_template;
use opys_mojang::{AssetManifest, Client};
use serde_json::json;

fn fixture(libraries: serde_json::Value, arguments: serde_json::Value) -> Client {
    Client::from_version_json(json!({
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
        "libraries": libraries,
        "arguments": arguments,
    }))
    .expect("client")
}

fn assets(objects: serde_json::Value) -> AssetManifest {
    serde_json::from_value(json!({ "objects": objects })).expect("asset manifest")
}

fn gson() -> serde_json::Value {
    json!({
        "name": "com.google.code.gson:gson:2.10.1",
        "downloads": { "artifact": {
            "path": "com/google/code/gson/gson/2.10.1/gson-2.10.1.jar",
            "sha1": "d".repeat(40), "size": 250,
            "url": "https://libraries.minecraft.net/gson.jar",
        }},
    })
}

fn flat<'a>(t: &'a opys_minecraft_vanilla::MinecraftTemplate, key: &str) -> &'a str {
    match t.vars.get(key) {
        Some(ValDef::Flat(s)) => s,
        other => panic!("{key} is not a flat var: {other:?}"),
    }
}

#[test]
fn artifacts_come_out_client_then_libraries_then_assets() {
    let t = client_to_template(
        &fixture(json!([gson()]), json!({ "game": [], "jvm": [] })),
        &assets(json!({ "pack.mcmeta": { "hash": "0f00", "size": 2 } })),
    )
    .unwrap();

    let paths: Vec<&str> = t.artifacts.iter().map(|a| a.path.as_str()).collect();
    assert_eq!(
        paths,
        [
            "${version_dir}/client.jar",
            "${library_directory}/com/google/code/gson/gson/2.10.1/gson-2.10.1.jar",
            "${assets_root}/indexes/5.json",
            "${assets_root}/objects/0f/0f00",
        ]
    );
    assert!(matches!(t.artifacts[0].source, Source::Url { .. }));
}

#[test]
fn vars_carry_the_version_identity_and_the_standard_layout() {
    let t = client_to_template(
        &fixture(json!([]), json!({ "game": [], "jvm": [] })),
        &assets(json!({})),
    )
    .unwrap();

    assert_eq!(flat(&t, "version_name"), "1.20.1");
    assert_eq!(flat(&t, "version_type"), "release");
    assert_eq!(flat(&t, "assets_index_name"), "5");
    assert_eq!(flat(&t, "version_dir"), "${root}/versions/${version_name}");
    assert_eq!(flat(&t, "natives_directory"), "${version_dir}/natives");
    assert_eq!(flat(&t, "launcher_name"), "opys");
}

#[test]
fn the_classpath_separator_is_semicolon_on_windows_only() {
    let t = client_to_template(
        &fixture(json!([]), json!({ "game": [], "jvm": [] })),
        &assets(json!({})),
    )
    .unwrap();
    let Some(ValDef::Arms(arms)) = t.vars.get("classpath_separator") else {
        panic!("classpath_separator is not rule-gated");
    };
    let values: Vec<&str> = arms.iter().map(|a| a.value.as_str()).collect();
    assert_eq!(values, [";", ":", ":"]);
}

#[test]
fn the_classpath_var_and_the_classpath_field_are_the_same_arms() {
    let t = client_to_template(
        &fixture(json!([gson()]), json!({ "game": [], "jvm": [] })),
        &assets(json!({})),
    )
    .unwrap();
    assert_eq!(
        t.vars.get("classpath"),
        Some(&ValDef::Arms(t.classpath.clone()))
    );
    assert!(t.classpath[0]
        .value
        .starts_with("${version_dir}/client.jar${classpath_separator}${library_directory}/com/"));
}

#[test]
fn the_launch_config_is_the_decomposed_parts_in_order() {
    let t = client_to_template(
        &fixture(json!([]), json!({ "game": ["--demo"], "jvm": ["-Xmx2G"] })),
        &assets(json!({})),
    )
    .unwrap();
    assert_eq!(
        t.launch.args,
        [
            t.jvm_args.clone(),
            vec![t.main_class.clone()],
            t.game_args.clone()
        ]
        .concat()
    );
    assert_eq!(t.main_class.value, ["net.minecraft.client.main.Main"]);
}

#[test]
fn the_template_roundtrips_through_json() {
    let t = client_to_template(
        &fixture(
            json!([gson()]),
            json!({ "game": ["--demo"], "jvm": ["-Xmx2G"] }),
        ),
        &assets(json!({ "pack.mcmeta": { "hash": "0f00", "size": 2 } })),
    )
    .unwrap();
    // The loaders hold this value in JS and hand pieces of it back, so it has
    // to survive the trip.
    let json = serde_json::to_value(&t).unwrap();
    let back: opys_minecraft_vanilla::MinecraftTemplate = serde_json::from_value(json).unwrap();
    assert_eq!(back, t);
}
