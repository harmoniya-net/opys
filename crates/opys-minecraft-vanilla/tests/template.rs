//! `client_to_template` — the pure half every loader in the family reuses.

use opys_core::{
    interpolate, resolve_val_defs, resolve_vars, resolved_args, OsOptions, Source, ValDef,
};
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
        .ends_with("${classpath_separator}${version_dir}/client.jar"));
    assert!(t.classpath[0]
        .value
        .starts_with("${library_directory}/com/"));
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

#[test]
fn the_launch_line_of_a_modern_version_names_no_undefined_variable() {
    // 1.20.1's own arguments, less the ones behind a feature: since 1.18 they
    // pass a Microsoft account's `--clientId` and `--xuid`, which a launcher
    // hands no var for, and the template has to define both.
    let t = client_to_template(
        &fixture(
            json!([gson()]),
            json!({
                "game": [
                    "--username", "${auth_player_name}", "--version", "${version_name}",
                    "--gameDir", "${game_directory}", "--assetsDir", "${assets_root}",
                    "--assetIndex", "${assets_index_name}", "--uuid", "${auth_uuid}",
                    "--accessToken", "${auth_access_token}", "--clientId", "${clientid}",
                    "--xuid", "${auth_xuid}", "--userType", "${user_type}",
                    "--versionType", "${version_type}",
                ],
                "jvm": [
                    "-Djava.library.path=${natives_directory}",
                    "-Dminecraft.launcher.brand=${launcher_name}",
                    "-Dminecraft.launcher.version=${launcher_version}",
                    "-cp", "${classpath}",
                ],
            }),
        ),
        &assets(json!({})),
    )
    .unwrap();

    let linux = OsOptions {
        name: "linux".to_owned(),
        version: String::new(),
        arch: "x86_64".to_owned(),
    };
    // What a launcher hands in: the account, and nothing of Microsoft's.
    let mut flat = resolve_val_defs(&t.vars, &linux, &[]).unwrap();
    for (key, value) in [("username", "Steve"), ("uuid", "0"), ("token", "0")] {
        flat.insert(key.to_owned(), value.to_owned());
    }
    let vars = resolve_vars(&flat).unwrap();
    let args: Vec<String> = resolved_args(&t.launch, &linux, &[])
        .unwrap()
        .iter()
        .map(|a| interpolate(a, &vars))
        .collect();

    let unresolved: Vec<&String> = args.iter().filter(|a| a.contains("${")).collect();
    assert!(unresolved.is_empty(), "unresolved: {unresolved:?}");
    // An empty value is an empty argument, kept in its place: the game reads
    // `--xuid` as taking one.
    let after = |flag: &str| {
        let i = args.iter().position(|a| a == flag).unwrap();
        args[i + 1].as_str()
    };
    assert_eq!(after("--xuid"), "");
    assert_eq!(after("--clientId"), "");
    assert_eq!(after("--userType"), "mojang");
}
