//! Scanning a directory into artifacts. The placing in between — which path,
//! which URL — is the caller's, so these tests do it by hand.

use std::path::Path;

use opys_bundle::{blob_id, BlobSource};
use opys_dev::{scan_directory, scanned_files, PlacedFile, ScanError, ScanHash, ScannedFile};
use serde_json::json;
use tempfile::tempdir;

fn touch(root: &Path, rel: &str, body: &str) {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, body).unwrap();
}

fn blob(abs: &Path, path: &str) -> PlacedFile {
    PlacedFile {
        abs: abs.to_owned(),
        path: path.to_owned(),
        url: None,
    }
}

fn published(abs: &Path, path: &str, url: &str) -> PlacedFile {
    PlacedFile {
        url: Some(url.to_owned()),
        ..blob(abs, path)
    }
}

const SHA1_HELLO: &str = "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d";

// ── what is on disk ───────────────────────────────────────────────────────

#[test]
fn every_file_is_found_with_its_relative_path_split_three_ways() {
    let dir = tempdir().unwrap();
    touch(dir.path(), "root.txt", "1");
    touch(dir.path(), "mods/jei.jar", "22");
    touch(dir.path(), "mods/deep/er/c.cfg", "333");
    let files = scan_directory(dir.path()).unwrap();

    let seen: Vec<(&str, &str, &str, u64)> = files
        .iter()
        .map(|f| (f.rel.as_str(), f.dir.as_str(), f.filename.as_str(), f.size))
        .collect();
    assert_eq!(
        seen,
        [
            ("mods/deep/er/c.cfg", "mods/deep/er", "c.cfg", 3),
            ("mods/jei.jar", "mods", "jei.jar", 2),
            // Empty at the root, not ".".
            ("root.txt", "", "root.txt", 1),
        ]
    );
    assert_eq!(files[1].abs, dir.path().join("mods").join("jei.jar"));
}

#[test]
fn the_order_is_the_paths_and_not_the_filesystems() {
    let dir = tempdir().unwrap();
    for name in ["z", "a", "m/z", "m/a", "B"] {
        touch(dir.path(), name, "x");
    }
    let rels: Vec<String> = scan_directory(dir.path())
        .unwrap()
        .into_iter()
        .map(|f| f.rel)
        .collect();
    assert_eq!(rels, ["B", "a", "m/a", "m/z", "z"]);
}

#[test]
fn an_empty_directory_and_empty_subdirectories_hold_no_files() {
    let dir = tempdir().unwrap();
    assert!(scan_directory(dir.path()).unwrap().is_empty());
    std::fs::create_dir_all(dir.path().join("a/b")).unwrap();
    assert!(scan_directory(dir.path()).unwrap().is_empty());
}

#[cfg(unix)]
#[test]
fn a_symlink_is_neither_a_file_nor_a_directory() {
    let dir = tempdir().unwrap();
    let outside = tempdir().unwrap();
    touch(outside.path(), "secret.txt", "s");
    touch(dir.path(), "real.txt", "r");
    std::os::unix::fs::symlink(outside.path(), dir.path().join("linked-dir")).unwrap();
    std::os::unix::fs::symlink(
        outside.path().join("secret.txt"),
        dir.path().join("linked-file"),
    )
    .unwrap();
    let rels: Vec<String> = scan_directory(dir.path())
        .unwrap()
        .into_iter()
        .map(|f| f.rel)
        .collect();
    assert_eq!(rels, ["real.txt"]);
}

#[test]
fn a_directory_that_is_not_there_is_named_in_the_error() {
    let ScanError::Io { path, .. } =
        scan_directory(Path::new("/nonexistent/opys-scan")).unwrap_err();
    assert_eq!(path, "/nonexistent/opys-scan");
}

#[test]
fn a_scanned_file_crosses_to_the_caller_as_plain_fields() {
    let dir = tempdir().unwrap();
    touch(dir.path(), "a/b.txt", "hi");
    let file = &scan_directory(dir.path()).unwrap()[0];
    let wire = serde_json::to_value(file).unwrap();
    assert_eq!(wire["rel"], "a/b.txt");
    assert_eq!(wire["dir"], "a");
    assert_eq!(wire["filename"], "b.txt");
    assert_eq!(wire["size"], 2);
    assert_eq!(serde_json::from_value::<ScannedFile>(wire).unwrap(), *file);
}

// ── a file that travels with the manifest ─────────────────────────────────

#[test]
fn a_file_with_no_url_is_carried_and_says_where_it_is() {
    let dir = tempdir().unwrap();
    touch(dir.path(), "a.txt", "hello");
    let abs = dir.path().join("a.txt");
    let contribution = scanned_files(&[blob(&abs, "${root}/a.txt")], ScanHash::default()).unwrap();

    // Not hashed here: the merge names it by its content.
    assert_eq!(
        serde_json::to_value(&contribution.artifacts).unwrap(),
        json!([{ "path": "${root}/a.txt", "source": { "file": abs } }])
    );
    let (artifact, held) = contribution.artifacts[0].clone().resolve().unwrap();
    let id = blob_id(b"hello");
    assert_eq!(
        serde_json::to_value(&artifact).unwrap(),
        json!({ "path": "${root}/a.txt", "source": { "blob": id }, "size": 5 })
    );
    assert_eq!(held, Some((id, BlobSource::File(abs))));
}

// ── a file published elsewhere ────────────────────────────────────────────

#[test]
fn a_file_with_a_url_points_at_it_and_is_pinned_by_sha1_unless_asked_otherwise() {
    let dir = tempdir().unwrap();
    touch(dir.path(), "a.txt", "hello");
    let files = [published(
        &dir.path().join("a.txt"),
        "a.txt",
        "https://cdn/a.txt",
    )];

    let sha1 = scanned_files(&files, ScanHash::default()).unwrap();
    assert_eq!(
        serde_json::to_value(&sha1.artifacts).unwrap(),
        json!([{ "path": "a.txt", "source": { "url": "https://cdn/a.txt" }, "size": 5, "integrity": { "sha1": SHA1_HELLO } }])
    );
    // Nothing to carry: the installer fetches it.
    assert_eq!(sha1.artifacts[0].clone().resolve().unwrap().1, None);

    let sha256 = scanned_files(&files, ScanHash::Sha256).unwrap();
    assert_eq!(
        serde_json::to_value(&sha256.artifacts[0]).unwrap()["integrity"],
        json!({ "sha256": blob_id(b"hello") })
    );
}

#[test]
fn the_two_kinds_mix_and_keep_the_order_they_were_placed_in() {
    let dir = tempdir().unwrap();
    touch(dir.path(), "pub.jar", "p");
    touch(dir.path(), "priv.jar", "q");
    let files = [
        published(
            &dir.path().join("pub.jar"),
            "mods/pub.jar",
            "https://cdn/pub.jar",
        ),
        blob(&dir.path().join("priv.jar"), "mods/priv.jar"),
    ];
    let contribution = scanned_files(&files, ScanHash::default()).unwrap();
    let paths: Vec<&str> = contribution
        .artifacts
        .iter()
        .map(|a| a.path().unwrap())
        .collect();
    assert_eq!(paths, ["mods/pub.jar", "mods/priv.jar"]);
}

#[test]
fn the_size_is_what_was_hashed() {
    // Bigger than one read of the hashing buffer, so the loop is exercised.
    let dir = tempdir().unwrap();
    let body = "x".repeat(200_000);
    touch(dir.path(), "big.bin", &body);
    let abs = dir.path().join("big.bin");
    for file in [blob(&abs, "big"), published(&abs, "big", "https://cdn/big")] {
        let contribution = scanned_files(&[file], ScanHash::Sha256).unwrap();
        let (artifact, _) = contribution.artifacts[0].clone().resolve().unwrap();
        assert_eq!(artifact.size, Some(200_000));
        let integrity = serde_json::to_value(&artifact.integrity).unwrap();
        assert_eq!(integrity, json!({ "sha256": blob_id(body.as_bytes()) }));
    }
}

#[test]
fn a_file_that_vanished_between_the_scan_and_the_hash_is_named() {
    let gone = Path::new("/nonexistent/opys-scan/a.txt");
    let ScanError::Io { path, .. } = scanned_files(
        &[published(gone, "a", "https://cdn/a")],
        ScanHash::default(),
    )
    .unwrap_err();
    assert_eq!(path, "/nonexistent/opys-scan/a.txt");
    // A carried file is read by the merge, which is where it is missed.
    let carried = scanned_files(&[blob(gone, "a")], ScanHash::default()).unwrap();
    let error = carried.artifacts[0].clone().resolve().unwrap_err();
    assert!(error.to_string().contains("/nonexistent/opys-scan/a.txt"));
}

#[test]
fn a_placed_file_reads_off_the_wire_and_a_typo_is_refused() {
    let file: PlacedFile = serde_json::from_value(json!({ "abs": "/a", "path": "a" })).unwrap();
    assert_eq!(file.url, None);
    let file: PlacedFile =
        serde_json::from_value(json!({ "abs": "/a", "path": "a", "url": "https://x" })).unwrap();
    assert_eq!(file.url.as_deref(), Some("https://x"));
    assert!(
        serde_json::from_value::<PlacedFile>(json!({ "abs": "/a", "path": "a", "uri": "x" }))
            .is_err()
    );
    assert_eq!(
        serde_json::from_value::<ScanHash>(json!("sha256")).unwrap(),
        ScanHash::Sha256
    );
    assert!(serde_json::from_value::<ScanHash>(json!("md5")).is_err());
}
