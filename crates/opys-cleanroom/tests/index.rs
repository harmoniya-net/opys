//! Resolving a version string against the published document index.

mod common;

use common::{Reply, TestServer};
use opys_cleanroom::resolve_cleanroom_version;
use serde_json::json;

const SITE: &str = "https://harmoniya-net.github.io/metadata/cleanroom";

fn document(mc: &str, cleanroom: &str) -> String {
    format!("{SITE}/versions/{mc}/{cleanroom}.json")
}

fn index() -> serde_json::Value {
    json!({
        "generated": "2026-10-07T00:00:00.000Z",
        "versions": {
            "1.12.2": {
                "latest": "0.6.13-alpha",
                "latestUrl": document("1.12.2", "0.6.13-alpha"),
                "recommended": "0.6.12-alpha",
                "recommendedUrl": document("1.12.2", "0.6.12-alpha"),
                "best": "0.6.12-alpha",
                "bestUrl": document("1.12.2", "0.6.12-alpha"),
                "builds": [
                    { "build": "0.5.9-alpha", "url": document("1.12.2", "0.5.9-alpha") },
                    { "build": "0.6.12-alpha", "url": document("1.12.2", "0.6.12-alpha") },
                    { "build": "0.6.13-alpha", "url": document("1.12.2", "0.6.13-alpha") },
                ],
            },
            // Not a version Cleanroom targets. It is here because the index is
            // keyed by Minecraft version and nothing in the crate may assume
            // there is only ever the one.
            "1.7.10": {
                "latest": "9.0.1-alpha",
                "latestUrl": document("1.7.10", "9.0.1-alpha"),
                "recommended": null,
                "recommendedUrl": null,
                "best": "9.0.1-alpha",
                "bestUrl": document("1.7.10", "9.0.1-alpha"),
                "builds": [{ "build": "9.0.1-alpha", "url": document("1.7.10", "9.0.1-alpha") }],
            },
        },
    })
}

fn server() -> TestServer {
    TestServer::start(|_| Reply::json(index().to_string()))
}

#[test]
fn a_bare_minecraft_version_resolves_to_its_best_build() {
    let server = server();
    let release = resolve_cleanroom_version("1.12.2", &server.base).unwrap();

    assert_eq!(release.minecraft, "1.12.2");
    assert_eq!(release.cleanroom, "0.6.12-alpha");
    assert_eq!(release.document_url, document("1.12.2", "0.6.12-alpha"));
}

#[test]
fn each_alias_resolves_to_the_build_the_index_names() {
    let server = server();
    for (alias, expected) in [
        ("latest", "0.6.13-alpha"),
        ("recommended", "0.6.12-alpha"),
        ("best", "0.6.12-alpha"),
    ] {
        let release = resolve_cleanroom_version(&format!("1.12.2-{alias}"), &server.base).unwrap();
        assert_eq!(release.cleanroom, expected, "{alias}");
    }
}

#[test]
fn a_release_tag_resolves_though_it_names_no_minecraft_version() {
    // `0.5.9-alpha` says nothing about 1.12.2, so there is no prefix to filter
    // by; the tag is found by looking, not by parsing.
    let server = server();
    let release = resolve_cleanroom_version("0.5.9-alpha", &server.base).unwrap();

    assert_eq!(release.minecraft, "1.12.2");
    assert_eq!(release.cleanroom, "0.5.9-alpha");
    assert_eq!(release.document_url, document("1.12.2", "0.5.9-alpha"));
}

#[test]
fn a_tag_ending_in_a_qualifier_is_not_mistaken_for_an_alias() {
    // Every Cleanroom tag ends in `-alpha`. The aliases are matched as whole
    // suffixes, so a tag is never read as `<minecraft>-<alias>`.
    let server = server();
    let release = resolve_cleanroom_version("0.6.13-alpha", &server.base).unwrap();

    assert_eq!(release.cleanroom, "0.6.13-alpha");
}

#[test]
fn a_tag_under_another_minecraft_version_is_found_there() {
    let server = server();
    let release = resolve_cleanroom_version("9.0.1-alpha", &server.base).unwrap();

    assert_eq!(release.minecraft, "1.7.10");
}

#[test]
fn a_bare_minecraft_version_with_no_stable_build_still_resolves_to_the_newest() {
    let server = server();
    let release = resolve_cleanroom_version("1.7.10", &server.base).unwrap();

    assert_eq!(release.cleanroom, "9.0.1-alpha");
}

#[test]
fn an_alias_with_no_build_behind_it_is_reported_rather_than_silently_skipped() {
    let server = server();
    let error = resolve_cleanroom_version("1.7.10-recommended", &server.base).unwrap_err();

    let message = error.to_string();
    assert!(message.contains("recommended"), "{message}");
    assert!(message.contains("1.7.10"), "{message}");
}

#[test]
fn an_unknown_minecraft_version_behind_an_alias_names_both() {
    let server = server();
    let error = resolve_cleanroom_version("9.9.9-latest", &server.base).unwrap_err();

    let message = error.to_string();
    assert!(message.contains("9.9.9"), "{message}");
    assert!(message.contains("9.9.9-latest"), "{message}");
}

#[test]
fn a_string_that_matches_nothing_names_the_index_it_was_looked_up_in() {
    let server = server();
    let error = resolve_cleanroom_version("0.0.0-alpha", &server.base).unwrap_err();

    let message = error.to_string();
    assert!(message.contains("0.0.0-alpha"), "{message}");
    assert!(message.contains(&server.base), "{message}");
}
