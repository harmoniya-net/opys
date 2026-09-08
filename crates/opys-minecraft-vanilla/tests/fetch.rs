//! The impure half: version manifest → version JSON → asset manifest.

mod common;

use common::{Reply, TestServer};
use opys_dev::JsonGetError;
use opys_minecraft_vanilla::{
    fetch_asset_manifest, fetch_client, fetch_version_manifest, MinecraftError,
};
use serde_json::json;

fn version_manifest(base: &str) -> String {
    json!({
        "latest": { "release": "1.20.1", "snapshot": "23w31a" },
        "versions": [
            {
                "id": "1.20.1", "type": "release",
                "url": format!("{base}/versions/1.20.1.json"),
                "time": "2023-06-12T00:00:00+00:00",
                "releaseTime": "2023-06-12T00:00:00+00:00",
                "sha1": "a".repeat(40), "complianceLevel": 1,
            },
            {
                "id": "1.19.4", "type": "release",
                "url": format!("{base}/versions/1.19.4.json"),
                "time": "2023-03-14T00:00:00+00:00",
                "releaseTime": "2023-03-14T00:00:00+00:00",
                "sha1": "b".repeat(40), "complianceLevel": 1,
            },
        ],
    })
    .to_string()
}

fn version_json(id: &str, base: &str) -> String {
    json!({
        "id": id,
        "type": "release",
        "time": "2023-06-12T00:00:00+00:00",
        "releaseTime": "2023-06-12T00:00:00+00:00",
        "minimumLauncherVersion": 21,
        "assets": "5",
        "complianceLevel": 1,
        "mainClass": "net.minecraft.client.main.Main",
        "assetIndex": { "id": "5", "sha1": "c".repeat(40), "size": 1, "totalSize": 2, "url": format!("{base}/assets/5.json") },
        "downloads": { "client": { "sha1": "d".repeat(40), "size": 3, "url": "https://x/client.jar" } },
        "libraries": [],
        "arguments": { "game": [], "jvm": [] },
    })
    .to_string()
}

/// A server that answers the version manifest and every version JSON under
/// it. The manifest body has to name the server's own port, which is only
/// known once the listener is bound — hence the `OnceLock` the route closes
/// over.
fn mojang() -> TestServer {
    let base = std::sync::Arc::new(std::sync::OnceLock::<String>::new());
    let for_route = std::sync::Arc::clone(&base);
    let server = TestServer::start(move |request| {
        if request.target.starts_with("/versions/") {
            let id = request
                .target
                .trim_start_matches("/versions/")
                .trim_end_matches(".json");
            return Reply::json(version_json(id, for_route.get().expect("base set")));
        }
        if request.target.starts_with("/assets/") {
            return Reply::json(
                json!({ "objects": { "pack.mcmeta": { "hash": "0f00", "size": 2 } } }).to_string(),
            );
        }
        Reply::json(version_manifest(for_route.get().expect("base set")))
    });
    base.set(server.base.clone()).expect("base set once");
    server
}

#[test]
fn the_version_manifest_is_read_from_the_given_base() {
    let server = mojang();
    let manifest = fetch_version_manifest(Some(&format!("{}/manifest.json", server.base))).unwrap();
    assert_eq!(manifest.latest.release, "1.20.1");
    assert_eq!(manifest.versions.len(), 2);
    assert_eq!(server.targets(), ["/manifest.json"]);
}

#[test]
fn no_version_id_takes_the_current_release() {
    let server = mojang();
    let (version, client) =
        fetch_client(None, Some(&format!("{}/manifest.json", server.base))).unwrap();
    assert_eq!(version.id, "1.20.1");
    assert_eq!(client.id, "1.20.1");
    assert_eq!(
        server.targets(),
        ["/manifest.json", "/versions/1.20.1.json"]
    );
}

#[test]
fn a_version_id_is_looked_up_in_the_manifest() {
    let server = mojang();
    let (version, client) = fetch_client(
        Some("1.19.4"),
        Some(&format!("{}/manifest.json", server.base)),
    )
    .unwrap();
    assert_eq!(version.id, "1.19.4");
    assert_eq!(client.id, "1.19.4");
}

#[test]
fn an_unknown_version_id_is_named_in_the_error() {
    let server = mojang();
    let err = fetch_client(
        Some("1.2.3"),
        Some(&format!("{}/manifest.json", server.base)),
    )
    .unwrap_err();
    assert!(matches!(err, MinecraftError::VersionNotFound(ref id) if id == "1.2.3"));
    assert!(err.to_string().contains("1.2.3"));
}

#[test]
fn a_non_2xx_carries_the_url_and_the_status() {
    let server = TestServer::start(|_| Reply::status(503));
    let url = format!("{}/manifest.json", server.base);
    let err = fetch_version_manifest(Some(&url)).unwrap_err();
    assert!(matches!(
        err,
        MinecraftError::Fetch(JsonGetError::Status { status: 503, .. })
    ));
    assert!(err.to_string().contains(&url));
}

#[test]
fn the_asset_manifest_is_fetched_from_the_url_it_is_given() {
    let server = TestServer::start(|_| {
        Reply::json(
            json!({ "objects": { "pack.mcmeta": { "hash": "0f00", "size": 2 } } }).to_string(),
        )
    });
    let manifest = fetch_asset_manifest(&format!("{}/5.json", server.base)).unwrap();
    assert_eq!(manifest.objects["pack.mcmeta"].hash, "0f00");
    assert_eq!(server.targets(), ["/5.json"]);
}

#[test]
fn a_malformed_body_is_a_json_error_not_a_panic() {
    let server = TestServer::start(|_| Reply::json("{ not json"));
    assert!(matches!(
        fetch_asset_manifest(&format!("{}/5.json", server.base)).unwrap_err(),
        MinecraftError::Fetch(JsonGetError::Decode(_))
    ));
}

#[test]
fn the_default_base_is_the_canonical_mojang_url() {
    // Not fetched — only the constant the `None` case falls back to.
    assert_eq!(
        opys_mojang::VERSION_MANIFEST_URL,
        "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json"
    );
}

// ── plugin ───────────────────────────────────────────────────────────────

#[test]
fn the_plugin_contributes_the_template_as_named_launch_groups() {
    use opys_dev::LaunchFragment;

    let server = mojang();
    let out = opys_minecraft_vanilla::build_minecraft(&opys_minecraft_vanilla::MinecraftOptions {
        version: Some("1.20.1".to_owned()),
        manifest_base: Some(format!("{}/manifest.json", server.base)),
    })
    .unwrap();

    assert_eq!(out.name, opys_minecraft_vanilla::PLUGIN_NAME);
    assert_eq!(
        out.contribution.launch.get("command"),
        Some(&LaunchFragment::Text("${java_bin}".to_owned()))
    );
    let Some(LaunchFragment::One(main)) = out.contribution.launch.get("mainClass") else {
        panic!("mainClass is not a single Val");
    };
    assert_eq!(main.value, ["net.minecraft.client.main.Main"]);
    assert!(out.contribution.launch.contains_key("jvmArgs"));
    assert!(out.contribution.launch.contains_key("gameArgs"));
    assert!(out.contribution.envs.is_empty());
    assert!(out.contribution.vars.contains_key("classpath"));
}
