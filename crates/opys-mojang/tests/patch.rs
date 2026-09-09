//! `VersionPatch` — the `inheritsFrom` document every mod loader publishes.
//!
//! The fixtures are trimmed real documents: a Forge 1.20.1 processor build, a
//! Forge 1.12.2 legacy build, and a Forge 1.5.2 jar-mod build, which is the
//! one that carries `arguments` and `minecraftArguments` at the same time.

use opys_mojang::{Arguments, MojangArgValue, VersionPatch};
use serde_json::json;

fn plain(args: &[&str]) -> Vec<MojangArgValue> {
    args.iter()
        .map(|a| MojangArgValue::Plain((*a).to_owned()))
        .collect()
}

fn base() -> Arguments {
    Arguments {
        game: plain(&["--username", "${auth_player_name}"]),
        jvm: plain(&["-cp", "${classpath}"]),
        legacy: false,
    }
}

fn parse(raw: serde_json::Value) -> VersionPatch {
    serde_json::from_value(raw).unwrap()
}

#[test]
fn a_patch_names_what_it_inherits_and_what_it_launches() {
    let p = parse(json!({
        "id": "1.20.1-forge-47.4.0",
        "inheritsFrom": "1.20.1",
        "mainClass": "io.github.zekerzhayard.forgewrapper.installer.Main",
        "libraries": [],
    }));

    assert_eq!(p.id, "1.20.1-forge-47.4.0");
    assert_eq!(p.inherits_from, "1.20.1");
    assert_eq!(
        p.main_class,
        "io.github.zekerzhayard.forgewrapper.installer.Main"
    );
}

#[test]
fn a_patch_with_no_arguments_at_all_contributes_nothing() {
    // 1.7.10-era documents carry `minecraftArguments` only; a 1.5.1 one can
    // carry neither. Neither is an error — the base version answers.
    let p = parse(json!({
        "id": "x", "inheritsFrom": "1.5.1", "mainClass": "M", "libraries": [],
    }));

    assert!(p.game_override.is_none());
    assert_eq!(p.merge_args(&base()), base());
}

#[test]
fn structured_arguments_append_to_the_base() {
    let p = parse(json!({
        "id": "x", "inheritsFrom": "1.20.1", "mainClass": "M", "libraries": [],
        "arguments": {
            "game": ["--launchTarget", "forgeclient"],
            "jvm": ["-DlibraryDirectory=${library_directory}"],
        },
    }));

    let merged = p.merge_args(&base());
    assert_eq!(
        merged.jvm,
        plain(&["-cp", "${classpath}", "-DlibraryDirectory=${library_directory}"]),
    );
    assert_eq!(
        merged.game,
        plain(&[
            "--username",
            "${auth_player_name}",
            "--launchTarget",
            "forgeclient",
        ]),
    );
}

#[test]
fn minecraft_arguments_replace_the_bases_game_line_rather_than_extending_it() {
    // It is the whole line, not a delta — appending it would launch with two
    // `--username` arguments.
    let p = parse(json!({
        "id": "x", "inheritsFrom": "1.7.10", "mainClass": "M", "libraries": [],
        "minecraftArguments": "--username ${auth_player_name} --tweakClass cpw.mods.fml.common.launcher.FMLTweaker",
    }));

    let merged = p.merge_args(&base());
    assert_eq!(
        merged.game,
        plain(&[
            "--username",
            "${auth_player_name}",
            "--tweakClass",
            "cpw.mods.fml.common.launcher.FMLTweaker",
        ]),
    );
    // The JVM half still appends — the two fields are independent.
    assert_eq!(merged.jvm, plain(&["-cp", "${classpath}"]));
}

#[test]
fn a_patch_carrying_both_argument_fields_keeps_both() {
    // The 1.5.2 shape: wrapper properties under `arguments.jvm`, the tweak
    // line under `minecraftArguments`. A reader that picks one field or the
    // other drops half the document — the wrapper never starts, or it starts
    // without its tweaker.
    let p = parse(json!({
        "id": "1.5.2-Forge7.8.1.738",
        "inheritsFrom": "1.5.2",
        "mainClass": "io.github.zekerzhayard.forgewrapper.installer.Main",
        "arguments": { "jvm": ["-Dforgewrapper.patched=${library_directory}/p.jar"] },
        "minecraftArguments": "${auth_player_name} --tweakClass net.minecraftforge.legacy._1_5_2.LibraryFixerTweaker",
        "libraries": [],
    }));

    let merged = p.merge_args(&base());
    assert_eq!(
        merged.jvm,
        plain(&[
            "-cp",
            "${classpath}",
            "-Dforgewrapper.patched=${library_directory}/p.jar",
        ]),
    );
    assert_eq!(
        merged.game,
        plain(&[
            "${auth_player_name}",
            "--tweakClass",
            "net.minecraftforge.legacy._1_5_2.LibraryFixerTweaker",
        ]),
    );
}

#[test]
fn a_string_under_arguments_means_what_minecraft_arguments_means() {
    // Same meaning, different field. Normalising it here is what keeps the
    // synthesised whole-launch JVM args of a legacy parse from being appended
    // to the base's — which would put `-cp` on the command line twice.
    let p = parse(json!({
        "id": "x", "inheritsFrom": "1.6.4", "mainClass": "M", "libraries": [],
        "arguments": "--username ${auth_player_name}",
    }));

    assert_eq!(p.args.jvm, Vec::new());
    let merged = p.merge_args(&base());
    assert_eq!(merged.game, plain(&["--username", "${auth_player_name}"]));
    assert_eq!(merged.jvm, plain(&["-cp", "${classpath}"]));
}

#[test]
fn libraries_are_flattened_the_same_way_a_version_jsons_are() {
    let p = parse(json!({
        "id": "x", "inheritsFrom": "1.12.2", "mainClass": "M",
        "libraries": [{
            "name": "net.minecraftforge:forge:1.12.2-14.23.5.2860",
            "downloads": { "artifact": {
                "path": "net/minecraftforge/forge/1.12.2-14.23.5.2860/forge-1.12.2-14.23.5.2860.jar",
                "url": "https://maven.minecraftforge.net/x.jar",
                "sha1": "029250575d3aa2cf80b56dffb66238a1eeaea2ac",
                "size": 4466148,
            }},
        }],
    }));

    assert_eq!(p.libraries.len(), 1);
    assert_eq!(p.libraries[0].name.artifact_id, "forge");
    assert!(!p.libraries[0].native);
}

#[test]
fn an_empty_logging_object_is_rejected_rather_than_read_as_a_config() {
    // Forge's own documents used to ship `"logging": {}`. It is not a smaller
    // `logging`; there is no client config in it to hand a launcher.
    let raw = json!({
        "id": "x", "inheritsFrom": "1.20.1", "mainClass": "M", "libraries": [],
        "logging": {},
    });
    assert!(serde_json::from_value::<VersionPatch>(raw).is_err());
}
