//! Installing from a bundle — a file, or a URL to one — and from a manifest
//! in memory whose blobs are still files on this machine. The three must be
//! indistinguishable once the install is done.

mod common;

use std::io::{Cursor, Write};
use std::path::Path;

use common::{blob, blob_file, blobs, serve};
use opys_core::{blob_id, write_bundle, Manifest, BUNDLE_FORMAT};
use opys_runtime::{
    build_launch, install, prepare, resolve_manifest, InstallError, InstallOptions, LaunchOptions,
    ManifestSource,
};
use serde_json::json;
use tempfile::tempdir;

fn manifest(root: &Path, artifacts: serde_json::Value) -> Manifest {
    serde_json::from_value(json!({
        "vars": { "root": root.to_string_lossy() },
        "launch": { "command": "java", "workdir": "${root}", "args": ["-jar", "${root}/server.jar"] },
        "artifacts": artifacts,
    }))
    .unwrap()
}

/// The manifest and the blobs written down so far, as a bundle's bytes.
fn bundle_of(manifest: &Manifest) -> Vec<u8> {
    let mut out = Cursor::new(Vec::new());
    write_bundle(&mut out, manifest, &blobs()).unwrap();
    out.into_inner()
}

fn sample(root: &Path) -> Manifest {
    manifest(
        root,
        json!([
            { "path": "${root}/server.jar", "source": { "blob": blob("jar bytes") }, "size": 9 },
            { "path": "${root}/config/a.toml", "source": { "blob": blob("a = 1") } },
        ]),
    )
}

fn assert_installed(root: &Path) {
    assert_eq!(
        std::fs::read(root.join("server.jar")).unwrap(),
        b"jar bytes"
    );
    assert_eq!(std::fs::read(root.join("config/a.toml")).unwrap(), b"a = 1");
}

#[tokio::test]
async fn a_bundle_on_disk_installs_its_blobs() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("game");
    let path = dir.path().join("server.opys");
    std::fs::write(&path, bundle_of(&sample(&root))).unwrap();

    install(ManifestSource::bundle(&path), InstallOptions::new())
        .await
        .unwrap();
    assert_installed(&root);
}

#[tokio::test]
async fn a_bundle_behind_a_url_is_downloaded_and_installed() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("game");
    let base = serve(vec![("/server.opys", bundle_of(&sample(&root)))]);

    install(
        ManifestSource::url(format!("{base}/server.opys")),
        InstallOptions::new(),
    )
    .await
    .unwrap();
    assert_installed(&root);
}

#[tokio::test]
async fn a_manifest_in_memory_installs_from_where_its_blobs_are() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("game");
    let local = dir.path().join("built.jar");
    std::fs::write(&local, b"jar bytes").unwrap();
    let manifest = manifest(
        &root,
        json!([
            // A file on this machine, and bytes a plugin made.
            { "path": "${root}/server.jar", "source": { "blob": blob_file(&local) } },
            { "path": "${root}/config/a.toml", "source": { "blob": blob("a = 1") } },
        ]),
    );
    let source = ManifestSource::Manifest {
        manifest: Box::new(manifest),
        blobs: blobs(),
    };
    install(source, InstallOptions::new()).await.unwrap();
    assert_installed(&root);
}

#[tokio::test]
async fn a_second_install_from_the_same_bundle_copies_nothing() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("game");
    let path = dir.path().join("server.opys");
    std::fs::write(&path, bundle_of(&sample(&root))).unwrap();
    let source = || ManifestSource::bundle(&path);

    install(source(), InstallOptions::new()).await.unwrap();
    let before = std::fs::metadata(root.join("server.jar"))
        .unwrap()
        .modified()
        .unwrap();
    // A blob always has a hash, so a present file is always checked — and a
    // matching one is left exactly where it is.
    install(source(), InstallOptions::new()).await.unwrap();
    assert_eq!(
        std::fs::metadata(root.join("server.jar"))
            .unwrap()
            .modified()
            .unwrap(),
        before
    );

    std::fs::write(root.join("server.jar"), b"tampered").unwrap();
    install(source(), InstallOptions::new()).await.unwrap();
    assert_installed(&root);
}

#[tokio::test]
async fn a_downloaded_artifact_and_a_blob_install_side_by_side() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("game");
    let base = serve(vec![("/lib.jar", b"library".to_vec())]);
    let manifest = manifest(
        &root,
        json!([
            { "path": "${root}/lib.jar", "source": { "url": format!("{base}/lib.jar") },
              "integrity": { "sha256": blob_id(b"library") } },
            { "path": "${root}/server.jar", "source": { "blob": blob("jar bytes") } },
        ]),
    );
    let path = dir.path().join("server.opys");
    std::fs::write(&path, bundle_of(&manifest)).unwrap();

    install(ManifestSource::bundle(&path), InstallOptions::new())
        .await
        .unwrap();
    assert_eq!(std::fs::read(root.join("lib.jar")).unwrap(), b"library");
    assert_eq!(
        std::fs::read(root.join("server.jar")).unwrap(),
        b"jar bytes"
    );
}

#[tokio::test]
async fn a_download_that_is_not_what_the_manifest_pinned_fails_the_install() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("game");
    let base = serve(vec![("/lib.jar", b"something else".to_vec())]);
    let manifest = manifest(
        &root,
        json!([{ "path": "${root}/lib.jar", "source": { "url": format!("{base}/lib.jar") },
                 "integrity": { "sha256": blob_id(b"library") } }]),
    );
    let result = install(ManifestSource::manifest(manifest), InstallOptions::new()).await;
    assert!(matches!(result, Err(InstallError::Integrity { .. })));
}

// ── what is refused before anything is written ────────────────────────────

#[tokio::test]
async fn a_blob_nothing_holds_stops_the_install_before_it_starts() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("game");
    let manifest = manifest(
        &root,
        json!([
            { "path": "${root}/first.txt", "source": { "blob": blob("here") } },
            { "path": "${root}/second.txt", "source": { "blob": blob_id(b"nowhere") } },
        ]),
    );
    let source = ManifestSource::Manifest {
        manifest: Box::new(manifest),
        blobs: blobs(),
    };
    let message = install(source, InstallOptions::new())
        .await
        .unwrap_err()
        .to_string();
    assert!(message.contains(&blob_id(b"nowhere")), "{message}");
    assert!(
        !root.exists(),
        "nothing is installed from a manifest that cannot be completed"
    );
}

#[tokio::test]
async fn a_blob_whose_file_is_gone_fails_at_once_rather_than_after_retries() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("game");
    let manifest = manifest(
        &root,
        json!([{ "path": "${root}/a", "source": { "blob": common::unreadable_blob("x") } }]),
    );
    let source = ManifestSource::Manifest {
        manifest: Box::new(manifest),
        blobs: blobs(),
    };
    let started = std::time::Instant::now();
    let error = install(source, InstallOptions::new()).await.unwrap_err();
    assert!(matches!(error, InstallError::Io { .. }), "{error}");
    // The download path waits 0.5s, 2s and 8s between attempts.
    assert!(started.elapsed() < std::time::Duration::from_millis(400));
    assert!(!root.join("a.partial").exists());
}

#[tokio::test]
async fn a_file_that_is_not_a_bundle_and_a_url_that_is_not_there_are_errors() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("opys.json");
    std::fs::write(&path, b"{ \"vars\": {}, \"artifacts\": [] }").unwrap();
    let error = install(ManifestSource::bundle(&path), InstallOptions::new())
        .await
        .unwrap_err();
    assert!(error.to_string().starts_with("not a bundle"), "{error}");

    let missing = dir.path().join("missing.opys");
    let error = install(ManifestSource::bundle(&missing), InstallOptions::new())
        .await
        .unwrap_err();
    assert!(matches!(error, InstallError::Io { .. }), "{error}");

    let base = serve(vec![]);
    let error = install(
        ManifestSource::url(format!("{base}/server.opys")),
        InstallOptions::new(),
    )
    .await
    .unwrap_err();
    assert!(
        matches!(error, InstallError::Network { status: 404, .. }),
        "{error}"
    );
}

// ── launch ────────────────────────────────────────────────────────────────

/// A zip with a head and a list that does not parse.
fn bundle_with_unreadable_list(head: &serde_json::Value) -> Vec<u8> {
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default();
    zip.start_file("opys.json", options).unwrap();
    zip.write_all(head.to_string().as_bytes()).unwrap();
    zip.start_file("artifacts.json", options).unwrap();
    zip.write_all(b"megabytes of something else").unwrap();
    zip.finish().unwrap().into_inner()
}

#[tokio::test]
async fn the_launch_spec_of_a_bundle_is_read_from_its_head_alone() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("server.opys");
    let head = json!({
        "format": BUNDLE_FORMAT,
        "vars": { "root": "/srv/game" },
        "launch": { "command": "java", "workdir": "${root}", "args": ["-jar", "${root}/server.jar"] },
    });
    std::fs::write(&path, bundle_with_unreadable_list(&head)).unwrap();

    let spec = build_launch(ManifestSource::bundle(&path), &LaunchOptions::new())
        .await
        .unwrap();
    assert_eq!(spec.command, "java");
    assert_eq!(spec.workdir, "/srv/game");
    assert_eq!(spec.args, ["-jar", "/srv/game/server.jar"]);
}

#[tokio::test]
async fn prepare_installs_and_says_what_to_run_from_one_reading_of_the_bundle() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("game");
    let path = dir.path().join("server.opys");
    std::fs::write(&path, bundle_of(&sample(&root))).unwrap();

    let spec = prepare(ManifestSource::bundle(&path), LaunchOptions::new())
        .await
        .unwrap();
    assert_installed(&root);
    // The manifest joins with `/`, on every platform: it is interpolated,
    // not built as a path.
    assert_eq!(
        spec.args,
        [
            "-jar".to_owned(),
            format!("{}/server.jar", root.to_string_lossy())
        ]
    );

    // With the install switched off it is `build_launch`.
    let other = dir.path().join("elsewhere");
    let mut options = LaunchOptions::new();
    options.do_install = false;
    options.vars = Some([("root".to_owned(), other.to_string_lossy().into_owned())].into());
    let spec = prepare(ManifestSource::bundle(&path), options)
        .await
        .unwrap();
    assert_eq!(spec.workdir, other.to_string_lossy());
    assert!(!other.exists());
}

#[tokio::test]
async fn a_manifest_with_nothing_to_launch_is_refused_before_it_is_installed() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("game");
    let mut manifest = sample(&root);
    manifest.launch = None;
    let source = ManifestSource::Manifest {
        manifest: Box::new(manifest),
        blobs: blobs(),
    };
    let message = prepare(source, LaunchOptions::new())
        .await
        .unwrap_err()
        .to_string();
    assert!(message.contains("No launch config"), "{message}");
    assert!(!root.exists());
}

#[tokio::test]
async fn resolving_a_bundle_gives_back_the_manifest_it_was_written_from() {
    let dir = tempdir().unwrap();
    let manifest = sample(&dir.path().join("game"));
    let path = dir.path().join("server.opys");
    std::fs::write(&path, bundle_of(&manifest)).unwrap();
    let read = resolve_manifest(ManifestSource::bundle(&path))
        .await
        .unwrap();
    assert_eq!(read, manifest);
}

#[test]
fn a_source_decodes_itself_by_which_field_it_has() {
    let bundle: ManifestSource =
        serde_json::from_value(json!({ "bundle": "/srv/server.opys" })).unwrap();
    assert!(
        matches!(bundle, ManifestSource::Bundle(path) if path == Path::new("/srv/server.opys"))
    );
    let url: ManifestSource =
        serde_json::from_value(json!({ "url": "https://x/server.opys" })).unwrap();
    assert!(matches!(url, ManifestSource::Url(url) if url == "https://x/server.opys"));
    let bare: ManifestSource =
        serde_json::from_value(json!({ "manifest": { "vars": {} } })).unwrap();
    assert!(matches!(bare, ManifestSource::Manifest { blobs, .. } if blobs.is_empty()));
    let held: ManifestSource = serde_json::from_value(json!({
        "manifest": { "vars": {} },
        "blobs": { "0".repeat(64): { "bytes": "aGVsbG8=" } },
    }))
    .unwrap();
    assert!(matches!(held, ManifestSource::Manifest { blobs, .. } if blobs.len() == 1));
    // A bare manifest — what `install` used to take — says what is unknown.
    let bare = serde_json::from_value::<ManifestSource>(json!({ "vars": {} })).unwrap_err();
    assert!(bare.to_string().contains("unknown field `vars`"), "{bare}");
    for wrong in [
        json!({}),
        json!({ "bundle": "a.opys", "url": "https://x" }),
        json!({ "blobs": {} }),
    ] {
        let error = serde_json::from_value::<ManifestSource>(wrong).unwrap_err();
        assert!(
            error
                .to_string()
                .contains("`{ manifest, blobs? }`, `{ bundle }` or `{ url }`"),
            "{error}"
        );
    }
}
