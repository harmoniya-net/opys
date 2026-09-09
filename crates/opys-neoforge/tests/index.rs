//! Resolving a version string against the published document index.

mod common;

use common::{Reply, TestServer};
use opys_neoforge::resolve_neoforge_version;
use serde_json::json;

const SITE: &str = "https://harmoniya-net.github.io/ForgeWrapper/neoforge";

fn document(mc: &str, neoforge: &str) -> String {
    format!("{SITE}/versions/{mc}/{neoforge}.json")
}

fn index() -> serde_json::Value {
    json!({
        "generated": "2026-09-10T00:00:00.000Z",
        "versions": {
            "1.21.1": {
                "latest": "21.1.200-beta",
                "latestUrl": document("1.21.1", "21.1.200-beta"),
                "recommended": "21.1.172",
                "recommendedUrl": document("1.21.1", "21.1.172"),
                "best": "21.1.172",
                "bestUrl": document("1.21.1", "21.1.172"),
                "builds": [
                    { "neoforge": "21.1.170", "url": document("1.21.1", "21.1.170") },
                    { "neoforge": "21.1.172", "url": document("1.21.1", "21.1.172") },
                    { "neoforge": "21.1.200-beta", "url": document("1.21.1", "21.1.200-beta") },
                ],
            },
            // Minecraft dropped the leading `1.`; NeoForge grew a fourth
            // component. Neither half of the pair says anything about the other.
            "26.2": {
                "latest": "26.2.0.84",
                "latestUrl": document("26.2", "26.2.0.84"),
                "recommended": "26.2.0.84",
                "recommendedUrl": document("26.2", "26.2.0.84"),
                "best": "26.2.0.84",
                "bestUrl": document("26.2", "26.2.0.84"),
                "builds": [{ "neoforge": "26.2.0.84", "url": document("26.2", "26.2.0.84") }],
            },
            // Every build was a prerelease, so nothing was ever recommended.
            "1.20.2": {
                "latest": "20.2.88-beta",
                "latestUrl": document("1.20.2", "20.2.88-beta"),
                "recommended": null,
                "recommendedUrl": null,
                "best": "20.2.88-beta",
                "bestUrl": document("1.20.2", "20.2.88-beta"),
                "builds": [{ "neoforge": "20.2.88-beta", "url": document("1.20.2", "20.2.88-beta") }],
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
    let release = resolve_neoforge_version("1.21.1", &server.base).unwrap();

    assert_eq!(release.minecraft, "1.21.1");
    assert_eq!(release.neoforge, "21.1.172");
    assert_eq!(release.document_url, document("1.21.1", "21.1.172"));
}

#[test]
fn each_alias_resolves_to_the_build_the_index_names() {
    let server = server();
    for (alias, expected) in [
        ("latest", "21.1.200-beta"),
        ("recommended", "21.1.172"),
        ("best", "21.1.172"),
    ] {
        let release = resolve_neoforge_version(&format!("1.21.1-{alias}"), &server.base).unwrap();
        assert_eq!(release.neoforge, expected, "{alias}");
    }
}

#[test]
fn a_full_build_id_resolves_even_though_it_shares_no_text_with_its_minecraft_version() {
    // `21.1.170` does not begin with `1.21.1-`, so there is no prefix to
    // filter by; the id is found by looking, not by parsing.
    let server = server();
    let release = resolve_neoforge_version("21.1.170", &server.base).unwrap();

    assert_eq!(release.minecraft, "1.21.1");
    assert_eq!(release.neoforge, "21.1.170");
    assert_eq!(release.document_url, document("1.21.1", "21.1.170"));
}

#[test]
fn a_four_component_build_resolves_to_a_minecraft_version_with_no_leading_one() {
    // The pairing that breaks every regex: NeoForge 26.2.0.84 targets
    // Minecraft 26.2.
    let server = server();
    let release = resolve_neoforge_version("26.2.0.84", &server.base).unwrap();

    assert_eq!(release.minecraft, "26.2");
    assert_eq!(release.neoforge, "26.2.0.84");
}

#[test]
fn a_bare_minecraft_version_with_no_stable_build_still_resolves_to_the_newest() {
    let server = server();
    let release = resolve_neoforge_version("1.20.2", &server.base).unwrap();

    assert_eq!(release.neoforge, "20.2.88-beta");
}

#[test]
fn an_alias_with_no_build_behind_it_is_reported_rather_than_silently_skipped() {
    let server = server();
    let error = resolve_neoforge_version("1.20.2-recommended", &server.base).unwrap_err();

    let message = error.to_string();
    assert!(message.contains("recommended"), "{message}");
    assert!(message.contains("1.20.2"), "{message}");
}

#[test]
fn an_unknown_minecraft_version_behind_an_alias_names_both() {
    let server = server();
    let error = resolve_neoforge_version("9.9.9-latest", &server.base).unwrap_err();

    let message = error.to_string();
    assert!(message.contains("9.9.9"), "{message}");
    assert!(message.contains("9.9.9-latest"), "{message}");
}

#[test]
fn a_string_that_matches_nothing_names_the_index_it_was_looked_up_in() {
    let server = server();
    let error = resolve_neoforge_version("21.1.999", &server.base).unwrap_err();

    let message = error.to_string();
    assert!(message.contains("21.1.999"), "{message}");
    assert!(message.contains(&server.base), "{message}");
}
