//! Installing from a bundle — a file, or a URL to one — and from a manifest
//! in memory, which carries nothing. The three must be
//! indistinguishable once the install is done.

mod common;

use std::io::{Cursor, Write};
use std::path::Path;

use common::{blob, blobs, serve};
use opys_bundle::blob_id;
use opys_bundle::{write_bundle, BUNDLE_FORMAT};
use opys_core::Manifest;
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
async fn a_manifest_in_memory_cannot_name_a_blob() {
    // A blob is an entry of a bundle, and a manifest handed over in memory
    // came in none: it is refused before anything is installed from it.
    let dir = tempdir().unwrap();
    let root = dir.path().join("game");
    let base = serve(vec![("/lib.jar", b"library".to_vec())]);
    let manifest = manifest(
        &root,
        json!([
            { "path": "${root}/lib.jar", "source": { "url": format!("{base}/lib.jar") } },
            { "path": "${root}/second.txt", "source": { "blob": blob_id(b"nowhere") } },
        ]),
    );
    let message = install(ManifestSource::manifest(manifest), InstallOptions::new())
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

/// A zip with exactly these entries — a bundle some other writer made.
fn zip_of(files: &[(&str, &[u8])]) -> Vec<u8> {
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (name, body) in files {
        zip.start_file(*name, zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(body).unwrap();
    }
    zip.finish().unwrap().into_inner()
}

#[tokio::test]
async fn the_launch_spec_of_a_bundle_is_read_from_its_manifest() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("server.opys");
    let head = json!({ "format": BUNDLE_FORMAT }).to_string();
    let manifest = json!({
        "vars": { "root": "/srv/game" },
        "launch": { "command": "java", "workdir": "${root}", "args": ["-jar", "${root}/server.jar"] },
    })
    .to_string();
    std::fs::write(
        &path,
        zip_of(&[
            ("opys.json", head.as_bytes()),
            ("manifest.json", manifest.as_bytes()),
        ]),
    )
    .unwrap();

    let spec = build_launch(ManifestSource::bundle(&path), &LaunchOptions::new())
        .await
        .unwrap();
    assert_eq!(spec.command, "java");
    assert_eq!(spec.workdir, "/srv/game");
    assert_eq!(spec.args, ["-jar", "/srv/game/server.jar"]);
}

#[tokio::test]
async fn a_bundle_in_another_format_is_not_launched_from() {
    // A head that carries a launch line of its own, as some other format
    // might. It is not read from there: the bundle is refused for what it
    // says it is.
    let dir = tempdir().unwrap();
    let path = dir.path().join("server.opys");
    let head = json!({
        "format": BUNDLE_FORMAT + 1,
        "launch": { "command": "java", "workdir": "." },
    })
    .to_string();
    std::fs::write(
        &path,
        zip_of(&[("opys.json", head.as_bytes()), ("manifest.json", b"{}")]),
    )
    .unwrap();

    let error = build_launch(ManifestSource::bundle(&path), &LaunchOptions::new())
        .await
        .unwrap_err();
    assert!(
        error.to_string().contains("is not one this reader knows"),
        "{error}"
    );
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
    let source = common::bundled(&manifest);
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
    assert!(matches!(bare, ManifestSource::Manifest(_)));
    // A table of blobs beside the manifest is what it used to take.
    let held = serde_json::from_value::<ManifestSource>(json!({
        "manifest": { "vars": {} },
        "blobs": { "0".repeat(64): { "bytes": "aGVsbG8=" } },
    }))
    .unwrap_err();
    assert!(held.to_string().contains("unknown field `blobs`"), "{held}");
    // A bare manifest — what `install` used to take — says what is unknown.
    let bare = serde_json::from_value::<ManifestSource>(json!({ "vars": {} })).unwrap_err();
    assert!(bare.to_string().contains("unknown field `vars`"), "{bare}");
    for wrong in [
        json!({}),
        json!({ "bundle": "a.opys", "url": "https://x" }),
        json!({ "manifest": { "vars": {} }, "bundle": "a.opys" }),
    ] {
        let error = serde_json::from_value::<ManifestSource>(wrong).unwrap_err();
        assert!(
            error
                .to_string()
                .contains("`{ manifest }`, `{ bundle }` or `{ url }`"),
            "{error}"
        );
    }
}
