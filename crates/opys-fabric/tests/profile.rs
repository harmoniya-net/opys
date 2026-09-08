//! The launcher profile: parsing it, and its libraries as artifacts.

use opys_core::{HashEntry, Integrity, Source};
use opys_fabric::{library_artifact, FabricError, FabricLibrary, FabricProfile};
use opys_mojang::MojangArgValue;
use serde_json::json;

fn profile(value: serde_json::Value) -> FabricProfile {
    serde_json::from_value(value).unwrap()
}

fn library(name: &str, url: &str) -> FabricLibrary {
    FabricLibrary {
        name: name.to_owned(),
        url: url.to_owned(),
        sha1: None,
        size: None,
    }
}

#[test]
fn a_profile_names_what_it_inherits_from_and_what_it_launches() {
    let p = profile(json!({
        "inheritsFrom": "1.20.1",
        "mainClass": "net.fabricmc.loader.impl.launch.knot.KnotClient",
        "arguments": { "game": [], "jvm": ["-DFabricMcEmu= net.minecraft.client.main.Main "] },
        "libraries": [{ "name": "net.fabricmc:fabric-loader:0.16.10", "url": "https://maven.fabricmc.net/" }],
    }));

    assert_eq!(p.inherits_from, "1.20.1");
    assert_eq!(
        p.main_class,
        "net.fabricmc.loader.impl.launch.knot.KnotClient"
    );
    assert_eq!(
        p.arguments.jvm,
        [MojangArgValue::Plain(
            "-DFabricMcEmu= net.minecraft.client.main.Main ".to_owned()
        )]
    );
    assert!(!p.arguments.legacy);
}

#[test]
fn a_profile_with_no_arguments_key_contributes_nothing() {
    let p = profile(json!({
        "inheritsFrom": "1.20.1",
        "mainClass": "Knot",
        "libraries": [],
    }));

    assert!(p.arguments.game.is_empty());
    assert!(p.arguments.jvm.is_empty());
    assert!(!p.arguments.legacy);
}

#[test]
fn unknown_profile_fields_are_ignored() {
    let p = profile(json!({
        "id": "fabric-loader-0.16.10-1.20.1",
        "type": "release",
        "releaseTime": "2024-01-01T00:00:00+00:00",
        "inheritsFrom": "1.20.1",
        "mainClass": "Knot",
        "libraries": [],
    }));
    assert_eq!(p.inherits_from, "1.20.1");
}

#[test]
fn a_library_lands_under_library_directory_in_maven_layout() {
    let (artifact, path) = library_artifact(&library(
        "net.fabricmc:fabric-loader:0.16.10",
        "https://maven.fabricmc.net/",
    ))
    .unwrap();

    assert_eq!(
        path,
        "net/fabricmc/fabric-loader/0.16.10/fabric-loader-0.16.10.jar"
    );
    assert_eq!(artifact.path, format!("${{library_directory}}/{path}"));
    assert_eq!(
        artifact.source,
        Source::Url {
            url: "https://maven.fabricmc.net/net/fabricmc/fabric-loader/0.16.10/fabric-loader-0.16.10.jar"
                .to_owned()
        }
    );
}

#[test]
fn a_library_carries_no_rules_and_no_extraction() {
    let (artifact, _) = library_artifact(&library(
        "net.fabricmc:intermediary:1.20.1",
        "https://maven.fabricmc.net/",
    ))
    .unwrap();

    assert!(artifact.rules.is_empty());
    assert!(artifact.extract.is_none());
    assert!(artifact.discovery.is_none());
    assert!(artifact.metadata.is_none());
}

#[test]
fn a_probe_is_baked_in_only_when_meta_ships_one() {
    let bare = library(
        "net.fabricmc:intermediary:1.20.1",
        "https://maven.fabricmc.net/",
    );
    let (artifact, _) = library_artifact(&bare).unwrap();
    assert!(artifact.integrity.is_none());
    assert!(artifact.size.is_none());

    let probed = FabricLibrary {
        sha1: Some("a".repeat(40)),
        size: Some(2000),
        ..bare
    };
    let (artifact, _) = library_artifact(&probed).unwrap();
    assert_eq!(
        artifact.integrity,
        Some(Integrity::One(HashEntry::Sha1 {
            sha1: "a".repeat(40)
        }))
    );
    assert_eq!(artifact.size, Some(2000));
}

#[test]
fn an_empty_hash_or_a_zero_size_is_not_a_probe() {
    let lib = FabricLibrary {
        sha1: Some(String::new()),
        size: Some(0),
        ..library(
            "net.fabricmc:intermediary:1.20.1",
            "https://maven.fabricmc.net/",
        )
    };
    let (artifact, _) = library_artifact(&lib).unwrap();

    assert!(artifact.integrity.is_none());
    assert!(artifact.size.is_none());
}

#[test]
fn a_repo_base_with_no_trailing_slash_still_joins_cleanly() {
    let (artifact, _) = library_artifact(&library(
        "net.fabricmc:intermediary:1.20.1",
        "https://maven.fabricmc.net",
    ))
    .unwrap();

    assert_eq!(
        artifact.source,
        Source::Url {
            url: "https://maven.fabricmc.net/net/fabricmc/intermediary/1.20.1/intermediary-1.20.1.jar"
                .to_owned()
        }
    );
}

#[test]
fn a_classifier_and_a_packaging_reach_the_filename() {
    let (_, path) = library_artifact(&library(
        "org.lwjgl:lwjgl:zip:natives-linux:3.3.3",
        "https://maven.fabricmc.net/",
    ))
    .unwrap();

    assert_eq!(path, "org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-linux.zip");
}

#[test]
fn a_coordinate_with_no_version_is_named_in_the_error() {
    let err = library_artifact(&library(
        "net.fabricmc:intermediary",
        "https://maven.fabricmc.net/",
    ))
    .unwrap_err();

    assert!(
        matches!(err, FabricError::UnversionedLibrary(ref n) if n == "net.fabricmc:intermediary")
    );
    assert!(err.to_string().contains("net.fabricmc:intermediary"));
}
