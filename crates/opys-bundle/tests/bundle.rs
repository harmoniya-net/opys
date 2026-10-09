//! The bundle: one file that is a manifest and the blobs it names.

use std::io::{Cursor, Read, Write};

use opys_bundle::{
    blob_id, blob_id_of, open_bundle, read_bundle_head, write_bundle, BlobSource, Blobs,
    BundleError, Head, BUNDLE_FORMAT,
};
use opys_core::Manifest;
use serde_json::json;

const HELLO: &str = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

fn manifest(artifacts: serde_json::Value) -> Manifest {
    serde_json::from_value(json!({
        "vars": { "root": "/srv/game" },
        "launch": { "command": "java", "workdir": "${root}", "args": ["-jar", "server.jar"] },
        "cleanup": [{ "includes": ["${root}/mods/**"] }],
        "artifacts": artifacts,
    }))
    .unwrap()
}

fn sample() -> (Manifest, Blobs) {
    let other = blob_id(b"world");
    let manifest = manifest(json!([
        { "path": "${root}/a.jar", "source": { "url": "https://example.test/a.jar" }, "integrity": { "sha1": "0".repeat(40) } },
        { "path": "${root}/hello.txt", "source": { "blob": HELLO }, "size": 5 },
        { "path": "${root}/world.txt", "source": { "blob": other }, "size": 5, "rules": "allow.os.linux" },
    ]));
    let blobs = Blobs::from([
        (HELLO.to_owned(), BlobSource::Bytes(b"hello".to_vec())),
        (other, BlobSource::Bytes(b"world".to_vec())),
    ]);
    (manifest, blobs)
}

fn written(manifest: &Manifest, blobs: &Blobs) -> Vec<u8> {
    let mut out = Cursor::new(Vec::new());
    write_bundle(&mut out, manifest, blobs).unwrap();
    out.into_inner()
}

/// The raw entries of a zip, in the order they were written.
fn entries(bytes: &[u8]) -> Vec<(String, Vec<u8>, zip::CompressionMethod)> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    (0..archive.len())
        .map(|i| {
            let mut entry = archive.by_index(i).unwrap();
            let mut body = Vec::new();
            entry.read_to_end(&mut body).unwrap();
            (entry.name().to_owned(), body, entry.compression())
        })
        .collect()
}

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

fn open_error(bytes: Vec<u8>) -> BundleError {
    match open_bundle(Cursor::new(bytes)) {
        Ok(_) => panic!("the bundle opened"),
        Err(error) => error,
    }
}

// ── round trip ────────────────────────────────────────────────────────────

#[test]
fn a_bundle_reads_back_as_the_manifest_it_was_written_from() {
    let (manifest, blobs) = sample();
    let bundle = open_bundle(Cursor::new(written(&manifest, &blobs))).unwrap();
    assert_eq!(bundle.manifest(), &manifest);
    assert_eq!(bundle.into_manifest(), manifest);
}

#[test]
fn a_blob_comes_back_out_byte_for_byte() {
    let (manifest, blobs) = sample();
    let mut bundle = open_bundle(Cursor::new(written(&manifest, &blobs))).unwrap();
    let mut out = Vec::new();
    assert_eq!(bundle.copy_blob(HELLO, &mut out).unwrap(), 5);
    assert_eq!(out, b"hello");
    assert!(matches!(
        bundle.copy_blob(&"0".repeat(64), &mut Vec::new()),
        Err(BundleError::MissingBlob(_))
    ));
}

#[test]
fn a_blob_is_read_from_a_file_as_well_as_from_memory() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("hello.txt");
    std::fs::write(&path, b"hello").unwrap();
    let manifest = manifest(json!([{ "path": "a", "source": { "blob": HELLO } }]));
    let from_file = written(
        &manifest,
        &Blobs::from([(HELLO.to_owned(), BlobSource::File(path))]),
    );
    let from_memory = written(
        &manifest,
        &Blobs::from([(HELLO.to_owned(), BlobSource::Bytes(b"hello".to_vec()))]),
    );
    // Where a blob was kept leaves no trace in the bundle.
    assert_eq!(from_file, from_memory);
}

// ── layout ────────────────────────────────────────────────────────────────

#[test]
fn the_head_is_the_first_entry_and_is_stored_so_it_can_be_read_off_the_front() {
    let (manifest, blobs) = sample();
    let bytes = written(&manifest, &blobs);
    let all = entries(&bytes);
    let names: Vec<&str> = all.iter().map(|(name, ..)| name.as_str()).collect();
    let world = blob_id(b"world");
    let mut blob_names = [format!("blobs/{HELLO}"), format!("blobs/{world}")];
    blob_names.sort();
    assert_eq!(
        names,
        ["opys.json", "manifest.json", &blob_names[0], &blob_names[1]]
    );

    let (_, head, method) = &all[0];
    assert_eq!(*method, zip::CompressionMethod::Stored);
    // Stored means the head's own bytes are in the file as they are.
    let at = bytes
        .windows(head.len())
        .position(|w| w == &head[..])
        .unwrap();
    assert!(at < 100, "the head starts {at} bytes in");
}

#[test]
fn the_head_carries_the_format_and_the_manifest_is_whole_beside_it() {
    let (manifest, blobs) = sample();
    let all = entries(&written(&manifest, &blobs));
    let head: serde_json::Value = serde_json::from_slice(&all[0].1).unwrap();
    assert_eq!(head, json!({ "format": BUNDLE_FORMAT }));
    // Exactly what `opys-core` writes for a manifest: the container adds no
    // spelling of its own, and nothing of the manifest is in the head.
    let body: serde_json::Value = serde_json::from_slice(&all[1].1).unwrap();
    assert_eq!(body, serde_json::to_value(&manifest).unwrap());
    assert_eq!(
        opys_core::parse_manifest(std::str::from_utf8(&all[1].1).unwrap()).unwrap(),
        manifest
    );
}

#[test]
fn reading_the_head_does_not_need_the_manifest_to_be_readable() {
    let (manifest, blobs) = sample();
    let head = read_bundle_head(Cursor::new(written(&manifest, &blobs))).unwrap();
    assert_eq!(head, Head::default());
    assert_eq!(head.format, BUNDLE_FORMAT);

    // A bundle whose manifest is garbage still tells you what it is.
    let head_json = serde_json::to_vec(&head).unwrap();
    let broken = zip_of(&[("opys.json", &head_json), ("manifest.json", b"not json")]);
    assert_eq!(
        read_bundle_head(Cursor::new(broken.clone())).unwrap(),
        Head::default()
    );
    assert!(matches!(
        open_error(broken),
        BundleError::Json {
            entry: "manifest.json",
            ..
        }
    ));
}

#[test]
fn a_head_may_say_more_than_this_reader_asks_of_it() {
    // Metadata about the bundle is the head's to grow; the format is what
    // decides whether the manifest beside it can be read.
    let head = serde_json::to_vec(&json!({ "format": BUNDLE_FORMAT, "name": "my-pack" })).unwrap();
    let bundle = zip_of(&[("opys.json", &head), ("manifest.json", b"{}")]);
    assert_eq!(
        read_bundle_head(Cursor::new(bundle.clone())).unwrap(),
        Head::default()
    );
    assert_eq!(
        open_bundle(Cursor::new(bundle)).unwrap().into_manifest(),
        Manifest::default()
    );
}

#[test]
fn two_builds_of_the_same_manifest_are_the_same_bytes() {
    let (manifest, blobs) = sample();
    assert_eq!(written(&manifest, &blobs), written(&manifest, &blobs));
}

#[test]
fn a_blob_two_artifacts_share_is_written_once() {
    let manifest = manifest(json!([
        { "path": "a", "source": { "blob": HELLO } },
        { "path": "b", "source": { "blob": HELLO } },
    ]));
    let blobs = Blobs::from([(HELLO.to_owned(), BlobSource::Bytes(b"hello".to_vec()))]);
    assert_eq!(entries(&written(&manifest, &blobs)).len(), 3);
}

#[test]
fn a_blob_no_artifact_names_is_left_out() {
    // A later plugin replaced the artifact; its blob is still in the table.
    let (manifest, mut blobs) = sample();
    blobs.insert(blob_id(b"orphan"), BlobSource::Bytes(b"orphan".to_vec()));
    assert_eq!(entries(&written(&manifest, &blobs)).len(), 4);
}

#[test]
fn a_manifest_with_no_blobs_is_a_bundle_with_no_blobs() {
    let manifest =
        manifest(json!([{ "path": "a", "source": { "url": "https://example.test/a" } }]));
    let bytes = written(&manifest, &Blobs::new());
    assert_eq!(entries(&bytes).len(), 2);
    assert_eq!(
        open_bundle(Cursor::new(bytes)).unwrap().into_manifest(),
        manifest
    );
}

// ── what a writer refuses ─────────────────────────────────────────────────

#[test]
fn a_blob_the_table_does_not_hold_is_named() {
    let (manifest, _) = sample();
    let error = write_bundle(Cursor::new(Vec::new()), &manifest, &Blobs::new()).unwrap_err();
    assert!(
        matches!(&error, BundleError::MissingBlob(id) if id == HELLO),
        "{error}"
    );
}

#[test]
fn a_blob_that_is_not_what_its_name_says_is_refused() {
    let manifest = manifest(json!([{ "path": "a", "source": { "blob": HELLO } }]));
    let blobs = Blobs::from([(HELLO.to_owned(), BlobSource::Bytes(b"goodbye".to_vec()))]);
    let error = write_bundle(Cursor::new(Vec::new()), &manifest, &blobs).unwrap_err();
    let BundleError::BlobMismatch { id, found } = &error else {
        panic!("{error}");
    };
    assert_eq!(
        (id.as_str(), found.as_str()),
        (HELLO, blob_id(b"goodbye").as_str())
    );
}

#[test]
fn a_blob_file_that_is_gone_is_named_with_its_path() {
    let manifest = manifest(json!([{ "path": "a", "source": { "blob": HELLO } }]));
    let blobs = Blobs::from([(
        HELLO.to_owned(),
        BlobSource::File("/nonexistent/hello.txt".into()),
    )]);
    let message = write_bundle(Cursor::new(Vec::new()), &manifest, &blobs)
        .unwrap_err()
        .to_string();
    assert!(message.contains("/nonexistent/hello.txt"), "{message}");
}

// ── what a reader refuses ─────────────────────────────────────────────────

#[test]
fn something_that_is_not_a_zip_is_not_a_bundle() {
    assert!(matches!(
        open_error(b"{ \"vars\": {} }".to_vec()),
        BundleError::Zip(_)
    ));
    assert!(read_bundle_head(Cursor::new(b"nope".to_vec())).is_err());
}

#[test]
fn a_zip_without_a_head_or_without_a_manifest_is_not_a_bundle() {
    let error = open_error(zip_of(&[("readme.txt", b"hi")]));
    assert!(
        matches!(error, BundleError::MissingEntry("opys.json")),
        "{error}"
    );
    let head = serde_json::to_vec(&json!({ "format": BUNDLE_FORMAT })).unwrap();
    let error = open_error(zip_of(&[("opys.json", &head)]));
    assert!(
        matches!(error, BundleError::MissingEntry("manifest.json")),
        "{error}"
    );
}

#[test]
fn a_format_this_reader_does_not_know_is_refused_before_anything_else_is_read() {
    // The rest of this head would not parse — and that is not what is reported.
    let newer = u64::from(BUNDLE_FORMAT) + 1;
    let head = serde_json::to_vec(&json!({ "format": newer })).unwrap();
    let bundle = zip_of(&[
        ("opys.json", &head),
        ("manifest.json", b"spelled some new way"),
    ]);
    assert!(matches!(
        open_error(bundle.clone()),
        BundleError::Format { found } if found == newer
    ));
    assert!(matches!(
        read_bundle_head(Cursor::new(bundle)),
        Err(BundleError::Format { found }) if found == newer
    ));
}

#[test]
fn a_lower_format_is_refused_like_a_higher_one() {
    // Nothing is migrated or read leniently, whichever way the number is off.
    let head = serde_json::to_vec(&json!({ "format": 0 })).unwrap();
    let bundle = zip_of(&[("opys.json", &head), ("manifest.json", b"{}")]);
    assert!(matches!(
        open_error(bundle.clone()),
        BundleError::Format { found: 0 }
    ));
    assert!(matches!(
        read_bundle_head(Cursor::new(bundle)),
        Err(BundleError::Format { found: 0 })
    ));
}

#[test]
fn a_head_without_a_format_is_refused() {
    let head = serde_json::to_vec(&json!({ "name": "my-pack" })).unwrap();
    let error = open_error(zip_of(&[("opys.json", &head), ("manifest.json", b"{}")]));
    assert!(
        matches!(
            error,
            BundleError::Json {
                entry: "opys.json",
                ..
            }
        ),
        "{error}"
    );
}

#[test]
fn a_bundle_missing_a_blob_its_manifest_names_does_not_open() {
    let head = serde_json::to_vec(&json!({ "format": BUNDLE_FORMAT })).unwrap();
    let body = serde_json::to_vec(&json!({
        "artifacts": [{ "path": "a", "source": { "blob": HELLO } }],
    }))
    .unwrap();
    let error = open_error(zip_of(&[("opys.json", &head), ("manifest.json", &body)]));
    assert!(
        matches!(&error, BundleError::MissingBlob(id) if id == HELLO),
        "{error}"
    );
}

// ── the blob table ────────────────────────────────────────────────────────

#[test]
fn a_blob_id_is_the_sha256_of_the_bytes_however_they_are_read() {
    assert_eq!(blob_id(b"hello"), HELLO);
    assert_eq!(blob_id_of(&b"hello"[..]).unwrap(), (HELLO.to_owned(), 5));
}

#[test]
fn a_blob_source_crosses_as_a_path_or_as_base64() {
    let file: BlobSource = serde_json::from_value(json!({ "file": "/srv/a.jar" })).unwrap();
    assert_eq!(file, BlobSource::File("/srv/a.jar".into()));
    let bytes: BlobSource = serde_json::from_value(json!({ "bytes": "aGVsbG8=" })).unwrap();
    assert_eq!(bytes, BlobSource::Bytes(b"hello".to_vec()));
    assert_eq!(
        serde_json::to_value(&bytes).unwrap(),
        json!({ "bytes": "aGVsbG8=" })
    );
    assert_eq!(
        serde_json::to_value(&file).unwrap(),
        json!({ "file": "/srv/a.jar" })
    );
    assert!(serde_json::from_value::<BlobSource>(json!({ "bytes": "not base64!" })).is_err());
    let wrong = serde_json::from_value::<BlobSource>(json!({ "url": "https://x" })).unwrap_err();
    assert!(wrong.to_string().contains("unknown field `url`"), "{wrong}");
    for neither_or_both in [json!({}), json!({ "file": "/a", "bytes": "aGVsbG8=" })] {
        let wrong = serde_json::from_value::<BlobSource>(neither_or_both).unwrap_err();
        assert!(
            wrong.to_string().contains("`{ file }` or as `{ bytes }`"),
            "{wrong}"
        );
    }
}
