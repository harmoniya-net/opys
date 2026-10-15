//! `once`: a file installed where it is missing and the player's afterwards.
//! What is installed is verified as any file is; what is kept is never
//! compared, whatever its source says about its bytes.

mod common;

use opys_runtime::{install, InstallOptions};
use serde_json::{json, Value};
use tempfile::tempdir;

use common::blob;

async fn install_artifact(root: &str, artifact: Value) {
    let manifest = opys_core::parse_manifest(
        &json!({ "vars": { "root": root }, "artifacts": [artifact] }).to_string(),
    )
    .unwrap();
    install(common::bundled(&manifest), InstallOptions::new())
        .await
        .unwrap();
}

#[tokio::test]
async fn a_missing_file_is_installed_from_its_blob() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    install_artifact(
        &root,
        json!({ "path": "${root}/options.txt", "source": { "blob": blob("fov:70") }, "once": true }),
    )
    .await;
    assert_eq!(
        std::fs::read_to_string(dir.path().join("options.txt")).unwrap(),
        "fov:70"
    );
}

#[tokio::test]
async fn a_present_file_is_the_players_and_is_kept() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    std::fs::write(dir.path().join("options.txt"), "fov:110").unwrap();
    install_artifact(
        &root,
        json!({ "path": "${root}/options.txt", "source": { "blob": blob("fov:70") }, "once": true }),
    )
    .await;
    assert_eq!(
        std::fs::read_to_string(dir.path().join("options.txt")).unwrap(),
        "fov:110"
    );
}

#[tokio::test]
async fn a_kept_download_is_not_asked_for() {
    // Nothing listens there and the hash names other bytes: either a fetch
    // or a comparison would fail the install.
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    std::fs::write(dir.path().join("servers.dat"), "edited").unwrap();
    install_artifact(
        &root,
        json!({
            "path": "${root}/servers.dat",
            "source": { "url": "http://127.0.0.1:1/servers.dat" },
            "integrity": { "sha256": "0".repeat(64) },
            "once": true,
        }),
    )
    .await;
    assert_eq!(
        std::fs::read_to_string(dir.path().join("servers.dat")).unwrap(),
        "edited"
    );
}

#[tokio::test]
async fn without_once_a_changed_file_is_put_back() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().into_owned();
    std::fs::write(dir.path().join("options.txt"), "fov:110").unwrap();
    install_artifact(
        &root,
        json!({ "path": "${root}/options.txt", "source": { "blob": blob("fov:70") } }),
    )
    .await;
    assert_eq!(
        std::fs::read_to_string(dir.path().join("options.txt")).unwrap(),
        "fov:70"
    );
}
