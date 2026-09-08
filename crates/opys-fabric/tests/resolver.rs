//! Fabric Meta: picking a loader build and spelling the profile URL.

mod common;

use common::{Reply, TestServer};
use opys_fabric::{resolve_fabric_version, FabricError, DEFAULT_FABRIC_META};
use serde_json::json;

fn builds(entries: &[(&str, bool)]) -> String {
    json!(entries
        .iter()
        .map(|(version, stable)| json!({ "loader": { "version": version, "stable": stable } }))
        .collect::<Vec<_>>())
    .to_string()
}

#[test]
fn a_pinned_loader_builds_the_profile_url_without_asking_meta() {
    let server = TestServer::start(|_| Reply::status(500));
    let release = resolve_fabric_version("1.21.4", &server.base, Some("0.16.10")).unwrap();

    assert_eq!(release.game_version, "1.21.4");
    assert_eq!(release.loader_version, "0.16.10");
    assert_eq!(
        release.profile_url,
        format!(
            "{}/v2/versions/loader/1.21.4/0.16.10/profile/json",
            server.base
        )
    );
    assert!(server.requests().is_empty());
}

#[test]
fn the_newest_stable_build_wins_over_a_newer_prerelease() {
    let server = TestServer::start(|_| {
        Reply::json(builds(&[
            ("0.16.10", false),
            ("0.16.9", true),
            ("0.16.8", true),
        ]))
    });
    let release = resolve_fabric_version("1.21.4", &server.base, None).unwrap();

    assert_eq!(release.loader_version, "0.16.9");
    assert!(release.profile_url.contains("/0.16.9/profile/json"));
}

#[test]
fn with_no_stable_build_the_newest_one_is_taken() {
    let server =
        TestServer::start(|_| Reply::json(builds(&[("0.17.0-beta", false), ("0.16.10", false)])));
    assert_eq!(
        resolve_fabric_version("1.21.4", &server.base, None)
            .unwrap()
            .loader_version,
        "0.17.0-beta"
    );
}

#[test]
fn a_build_with_no_stable_flag_counts_as_unstable() {
    let server = TestServer::start(|_| {
        Reply::json(
            json!([
                { "loader": { "version": "0.17.0" } },
                { "loader": { "version": "0.16.9", "stable": true } },
            ])
            .to_string(),
        )
    });
    assert_eq!(
        resolve_fabric_version("1.21.4", &server.base, None)
            .unwrap()
            .loader_version,
        "0.16.9"
    );
}

#[test]
fn trailing_slashes_on_the_meta_base_are_trimmed() {
    let server = TestServer::start(|_| Reply::json(builds(&[("0.16.10", true)])));
    resolve_fabric_version("1.21.4", &format!("{}///", server.base), None).unwrap();
    assert_eq!(server.targets(), ["/v2/versions/loader/1.21.4"]);
}

#[test]
fn an_empty_build_list_names_the_game_version() {
    let server = TestServer::start(|_| Reply::json("[]"));
    let err = resolve_fabric_version("9.9.9", &server.base, None).unwrap_err();

    assert!(matches!(err, FabricError::NoLoaderBuild(ref v) if v == "9.9.9"));
    assert!(err.to_string().contains("9.9.9"));
}

#[test]
fn a_non_2xx_from_meta_carries_the_url_and_the_status() {
    let server = TestServer::start(|_| Reply::status(403));
    let err = resolve_fabric_version("1.21.4", &server.base, None).unwrap_err();

    assert!(err.to_string().contains("403"));
    assert!(err.to_string().contains(&server.base));
}

#[test]
fn the_default_meta_base_is_the_canonical_fabricmc_url() {
    assert_eq!(DEFAULT_FABRIC_META, "https://meta.fabricmc.net");
}
