//! Resolving a version string against the published document index.

mod common;

use common::{Reply, TestServer};
use opys_forge::resolve_forge_version;
use serde_json::json;

const SITE: &str = "https://harmoniya-net.github.io/ForgeWrapper";

fn document(mc: &str, forge: &str) -> String {
    format!("{SITE}/versions/{mc}/{forge}.json")
}

fn index() -> serde_json::Value {
    json!({
        "generated": "2026-09-09T14:37:33.806Z",
        "versions": {
            "1.20.1": {
                "latest": "1.20.1-47.4.23",
                "latestUrl": document("1.20.1", "1.20.1-47.4.23"),
                "recommended": "1.20.1-47.4.10",
                "recommendedUrl": document("1.20.1", "1.20.1-47.4.10"),
                "best": "1.20.1-47.4.10",
                "bestUrl": document("1.20.1", "1.20.1-47.4.10"),
                "builds": [
                    { "forge": "1.20.1-47.0.0", "url": document("1.20.1", "1.20.1-47.0.0") },
                    { "forge": "1.20.1-47.4.10", "url": document("1.20.1", "1.20.1-47.4.10") },
                    { "forge": "1.20.1-47.4.23", "url": document("1.20.1", "1.20.1-47.4.23") },
                ],
            },
            // No promotion of either kind ever ran for this one; the index
            // still lists its builds.
            "1.7": {
                "latest": null, "latestUrl": null,
                "recommended": null, "recommendedUrl": null,
                "best": null, "bestUrl": null,
                "builds": [{ "forge": "1.7-10.12.0.1024", "url": document("1.7", "1.7-10.12.0.1024") }],
            },
            "1.7.10": {
                "latest": "1.7.10-10.13.4.1614-1.7.10",
                "latestUrl": document("1.7.10", "1.7.10-10.13.4.1614-1.7.10"),
                "recommended": null,
                "recommendedUrl": null,
                "best": "1.7.10-10.13.4.1614-1.7.10",
                "bestUrl": document("1.7.10", "1.7.10-10.13.4.1614-1.7.10"),
                "builds": [
                    { "forge": "1.7.10-10.13.4.1614-1.7.10", "url": document("1.7.10", "1.7.10-10.13.4.1614-1.7.10") },
                ],
            },
        },
    })
}

fn server() -> TestServer {
    TestServer::start(|_| Reply::json(index().to_string()))
}

#[test]
fn a_bare_minecraft_version_resolves_to_its_best_build() {
    let s = server();
    let release = resolve_forge_version("1.20.1", &s.base).unwrap();

    assert_eq!(release.minecraft, "1.20.1");
    assert_eq!(release.forge, "1.20.1-47.4.10");
    assert_eq!(release.document_url, document("1.20.1", "1.20.1-47.4.10"));
    assert_eq!(s.targets(), ["/index.json"]);
}

#[test]
fn each_alias_resolves_to_the_build_the_index_names() {
    let s = server();
    for (alias, forge) in [
        ("latest", "1.20.1-47.4.23"),
        ("recommended", "1.20.1-47.4.10"),
        ("best", "1.20.1-47.4.10"),
    ] {
        let release = resolve_forge_version(&format!("1.20.1-{alias}"), &s.base).unwrap();
        assert_eq!(release.forge, forge, "alias {alias}");
        assert_eq!(release.document_url, document("1.20.1", forge));
    }
}

#[test]
fn a_full_build_id_resolves_without_going_through_an_alias() {
    let s = server();
    let release = resolve_forge_version("1.20.1-47.0.0", &s.base).unwrap();

    assert_eq!(release.minecraft, "1.20.1");
    assert_eq!(release.forge, "1.20.1-47.0.0");
}

#[test]
fn a_build_id_that_repeats_the_minecraft_version_resolves_to_that_version() {
    // The 1.7.10 era spells a build `1.7.10-10.13.4.1614-1.7.10`. Nothing in
    // the id says which half is the Minecraft version, so it is found by
    // looking it up in the index rather than by taking it apart.
    let s = server();
    let release = resolve_forge_version("1.7.10-10.13.4.1614-1.7.10", &s.base).unwrap();

    assert_eq!(release.minecraft, "1.7.10");
    assert_eq!(release.forge, "1.7.10-10.13.4.1614-1.7.10");
}

#[test]
fn an_unknown_minecraft_version_behind_an_alias_names_both() {
    let s = server();
    let err = resolve_forge_version("1.99-latest", &s.base).unwrap_err();

    let message = err.to_string();
    assert!(message.contains("1.99"), "{message}");
    assert!(message.contains("1.99-latest"), "{message}");
}

#[test]
fn an_alias_with_no_build_behind_it_is_reported_rather_than_silently_skipped() {
    let s = server();
    let err = resolve_forge_version("1.7.10-recommended", &s.base).unwrap_err();

    let message = err.to_string();
    assert!(message.contains("recommended"), "{message}");
    assert!(message.contains("1.7.10"), "{message}");
}

#[test]
fn a_version_with_no_promotions_at_all_still_resolves_by_build_id() {
    let s = server();
    let release = resolve_forge_version("1.7-10.12.0.1024", &s.base).unwrap();
    assert_eq!(release.minecraft, "1.7");

    // …but a bare version has nothing to pick, and says so.
    assert!(resolve_forge_version("1.7", &s.base).is_err());
}

#[test]
fn a_string_that_matches_nothing_names_the_index_it_was_looked_up_in() {
    let s = server();
    let err = resolve_forge_version("not-a-version", &s.base).unwrap_err();

    let message = err.to_string();
    assert!(message.contains("not-a-version"), "{message}");
    assert!(message.contains(&s.base), "{message}");
}
