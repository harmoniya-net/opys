//! A bundle's head, read without its manifest: from a file, and from a URL
//! by asking for the front of the file alone.

mod common;

use std::io::{BufRead, BufReader, Cursor, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

use common::serve;
use opys_bundle::{write_bundle, BlobSource, Blobs, Head, BUNDLE_FORMAT};
use opys_core::Manifest;
use opys_runtime::{read_head, InstallError, ManifestSource};
use serde_json::json;

/// A head with `count` options, each a feature of its own.
fn head(count: usize) -> Head {
    let options: Vec<_> = (0..count)
        .map(|n| json!({ "feature": format!("feature_{n}"), "title": format!("Feature {n}") }))
        .collect();
    serde_json::from_value(json!({ "format": BUNDLE_FORMAT, "options": options })).unwrap()
}

/// A bundle under `head` that carries `weight` bytes nothing compresses, so
/// that how much of it was sent can be told.
fn bundle(head: &Head, weight: usize) -> Vec<u8> {
    let mut state = 0x9E37_79B9_u32;
    let noise: Vec<u8> = (0..weight)
        .map(|_| {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            state as u8
        })
        .collect();
    let id = opys_bundle::blob_id(&noise);
    let manifest: Manifest = serde_json::from_value(json!({
        "launch": { "command": "java", "workdir": "${root}" },
        "artifacts": [{ "path": "${root}/noise", "source": { "blob": id } }],
    }))
    .unwrap();
    let blobs = Blobs::from([(id, BlobSource::Bytes(noise))]);
    let mut out = Cursor::new(Vec::new());
    write_bundle(&mut out, head, &manifest, &blobs).unwrap();
    out.into_inner()
}

/// What a server that serves ranges was asked for and how much it sent,
/// one entry per request.
type Asked = Arc<Mutex<Vec<(String, usize)>>>;

/// Serve `body` at any path, honouring `Range: bytes=0-N` as a real file
/// server does.
fn serve_ranges(body: Vec<u8>) -> (String, Asked) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let asked = Asked::default();
    let seen = asked.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut range = String::new();
            let mut line = String::new();
            while reader.read_line(&mut line).unwrap() > 2 {
                if let Some(value) = line.to_ascii_lowercase().strip_prefix("range:") {
                    range = value.trim().to_owned();
                }
                line.clear();
            }
            let last: usize = range
                .strip_prefix("bytes=0-")
                .and_then(|last| last.parse().ok())
                .unwrap_or(usize::MAX);
            let sent = &body[..body.len().min(last.saturating_add(1))];
            seen.lock().unwrap().push((range, sent.len()));
            let head = format!(
                "HTTP/1.1 206 Partial Content\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
                sent.len()
            );
            let _ = stream.write_all(head.as_bytes());
            let _ = stream.write_all(sent);
        }
    });
    (base, asked)
}

#[tokio::test]
async fn a_bundle_on_disk_gives_its_head() {
    let head = head(3);
    let file = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(file.path(), bundle(&head, 0)).unwrap();
    let read = read_head(&ManifestSource::bundle(file.path())).await;
    assert_eq!(read.unwrap(), Some(head));
}

#[tokio::test]
async fn a_manifest_in_memory_is_in_no_bundle_and_has_no_head() {
    let manifest: Manifest = serde_json::from_value(json!({
        "launch": { "command": "java", "workdir": "${root}" },
        "artifacts": [],
    }))
    .unwrap();
    let read = read_head(&ManifestSource::manifest(manifest)).await;
    assert_eq!(read.unwrap(), None);
}

#[tokio::test]
async fn a_bundle_behind_a_url_is_asked_for_its_front_and_no_more() {
    let head = head(3);
    let bytes = bundle(&head, 1_000_000);
    assert!(bytes.len() > 1_000_000);
    let (base, asked) = serve_ranges(bytes);

    let read = read_head(&ManifestSource::url(format!("{base}/game.opys"))).await;
    assert_eq!(read.unwrap(), Some(head));
    assert_eq!(
        *asked.lock().unwrap(),
        [("bytes=0-16383".to_owned(), 16_384)]
    );
}

#[tokio::test]
async fn a_head_longer_than_the_first_asking_is_asked_for_once_more() {
    let head = head(600);
    let bytes = bundle(&head, 1_000_000);
    let (base, asked) = serve_ranges(bytes);

    let read = read_head(&ManifestSource::url(format!("{base}/game.opys"))).await;
    assert_eq!(read.unwrap(), Some(head));
    let asked = asked.lock().unwrap();
    assert_eq!(asked.len(), 2, "{asked:?}");
    // The second asking is for the head exactly, which the first one sized.
    assert!(asked[1].1 > 16_384 && asked[1].1 < 100_000, "{asked:?}");
}

#[tokio::test]
async fn a_server_that_serves_no_ranges_is_read_from_all_the_same() {
    let head = head(600);
    let base = serve(vec![("/game.opys", bundle(&head, 1_000_000))]);
    let read = read_head(&ManifestSource::url(format!("{base}/game.opys"))).await;
    assert_eq!(read.unwrap(), Some(head));
}

#[tokio::test]
async fn what_is_not_a_bundle_is_refused_and_what_is_not_there_is_a_network_error() {
    let mut cut = bundle(&head(600), 0);
    cut.truncate(2_000);
    let base = serve(vec![
        ("/page.html", b"<!doctype html>".repeat(10)),
        ("/cut.opys", cut),
    ]);
    let read = |path: &str| {
        let source = ManifestSource::url(format!("{base}{path}"));
        async move { read_head(&source).await.unwrap_err() }
    };

    assert!(read("/page.html")
        .await
        .to_string()
        .contains("not a bundle"));
    assert!(read("/cut.opys")
        .await
        .to_string()
        .contains("it ends inside its head"));
    assert!(matches!(
        read("/missing.opys").await,
        InstallError::Network { status: 404, .. }
    ));
}
