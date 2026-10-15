//! A bundle behind a URL, installed from in pieces: the directory and the
//! manifest every time, a blob only when the installation lacks it.

use std::io::{BufRead, BufReader, Cursor, Write};
use std::net::TcpListener;
use std::path::Path;
use std::sync::{Arc, Mutex};

use opys_bundle::{blob_id, write_bundle, BlobSource, Blobs, Head};
use opys_core::Manifest;
use opys_runtime::{install, resolve_manifest, InstallError, InstallOptions, ManifestSource};
use serde_json::json;
use tempfile::tempdir;

/// Bytes deflate cannot shrink, so what was sent is what a blob weighs.
fn noise(len: usize, seed: u32) -> Vec<u8> {
    let mut state = seed.wrapping_mul(0x9E37_79B9) | 1;
    (0..len)
        .map(|_| {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            state as u8
        })
        .collect()
}

/// A bundle of `count` blobs of `size` bytes each, installed under `root`.
fn bundle(root: &Path, count: u32, size: usize, seed: u32) -> (Vec<u8>, Vec<Vec<u8>>) {
    let contents: Vec<Vec<u8>> = (0..count).map(|n| noise(size, seed + n)).collect();
    let artifacts: Vec<_> = contents
        .iter()
        .enumerate()
        .map(|(n, content)| {
            json!({ "path": format!("${{root}}/files/{n}.bin"), "source": { "blob": blob_id(content) } })
        })
        .collect();
    let manifest: Manifest = serde_json::from_value(json!({
        "vars": { "root": root.to_string_lossy() },
        "launch": { "command": "java", "workdir": "${root}" },
        "artifacts": artifacts,
    }))
    .unwrap();
    let blobs: Blobs = contents
        .iter()
        .map(|content| (blob_id(content), BlobSource::Bytes(content.clone())))
        .collect();
    let mut out = Cursor::new(Vec::new());
    write_bundle(&mut out, &Head::default(), &manifest, &blobs).unwrap();
    (out.into_inner(), contents)
}

/// How the server behaves, and what it has been asked.
struct Server {
    body: Vec<u8>,
    etag: String,
    ranges: bool,
    validator: bool,
    /// After this many requests, the bundle is replaced by this one.
    republish: Option<(usize, Vec<u8>)>,
    /// The request, by its place, answered with a byte less than it asked.
    short: Option<usize>,
    /// One entry per request: the `Range` asked for and the bytes sent.
    asked: Vec<(String, usize)>,
}

type Shared = Arc<Mutex<Server>>;

fn server(body: Vec<u8>) -> Server {
    Server {
        body,
        etag: "\"1\"".to_owned(),
        ranges: true,
        validator: true,
        republish: None,
        short: None,
        asked: Vec::new(),
    }
}

/// The range `asked` names in a file `len` long, as a file server reads it.
fn span(asked: &str, len: usize) -> Option<(usize, usize)> {
    let spec = asked.strip_prefix("bytes=")?;
    let (first, last) = spec.split_once('-')?;
    if first.is_empty() {
        let suffix: usize = last.parse().ok()?;
        return Some((len - suffix.min(len), len - 1));
    }
    let last = if last.is_empty() {
        len - 1
    } else {
        last.parse::<usize>().ok()?.min(len - 1)
    };
    Some((first.parse().ok()?, last))
}

/// Serve the bundle at any path, with ranges and `If-Range` as a real file
/// server answers them.
fn serve(state: Server) -> (String, Shared) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/game.opys", listener.local_addr().unwrap());
    let shared: Shared = Arc::new(Mutex::new(state));
    let server = shared.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let (mut range, mut if_range) = (None, None);
            let mut line = String::new();
            while reader.read_line(&mut line).unwrap() > 2 {
                let lower = line.to_ascii_lowercase();
                if let Some(value) = lower.strip_prefix("range:") {
                    range = Some(value.trim().to_owned());
                }
                if let Some(value) = line
                    .strip_prefix("If-Range:")
                    .or(line.strip_prefix("if-range:"))
                {
                    if_range = Some(value.trim().to_owned());
                }
                line.clear();
            }
            let mut state = server.lock().unwrap();
            if let Some((after, _)) = &state.republish {
                if state.asked.len() == *after {
                    let (_, body) = state.republish.take().unwrap();
                    state.body = body;
                    state.etag = "\"2\"".to_owned();
                }
            }
            let len = state.body.len();
            let current = if_range.as_deref().map_or(true, |tag| tag == state.etag);
            let partial = range
                .as_deref()
                .filter(|_| state.ranges && current)
                .and_then(|asked| span(asked, len));
            let mut head = String::new();
            let sent = match partial {
                Some((first, last)) => {
                    head.push_str("HTTP/1.1 206 Partial Content\r\n");
                    head.push_str(&format!("content-range: bytes {first}-{last}/{len}\r\n"));
                    let cut = usize::from(state.short == Some(state.asked.len()));
                    state.body[first..=last - cut].to_vec()
                }
                None => {
                    head.push_str("HTTP/1.1 200 OK\r\n");
                    state.body.clone()
                }
            };
            if state.validator {
                head.push_str(&format!("etag: {}\r\n", state.etag));
            }
            head.push_str(&format!(
                "content-length: {}\r\nconnection: close\r\n\r\n",
                sent.len()
            ));
            state.asked.push((range.unwrap_or_default(), sent.len()));
            drop(state);
            let _ = stream.write_all(head.as_bytes());
            let _ = stream.write_all(&sent);
        }
    });
    (url, shared)
}

fn sent(server: &Shared) -> usize {
    server.lock().unwrap().asked.iter().map(|(_, n)| n).sum()
}

fn requests(server: &Shared) -> usize {
    server.lock().unwrap().asked.len()
}

fn reset(server: &Shared) {
    server.lock().unwrap().asked.clear();
}

async fn install_from(url: &str) -> Result<(), InstallError> {
    install(ManifestSource::url(url), InstallOptions::new()).await
}

fn assert_installed(root: &Path, contents: &[Vec<u8>]) {
    for (n, content) in contents.iter().enumerate() {
        let file = std::fs::read(root.join(format!("files/{n}.bin"))).unwrap();
        assert_eq!(&file, content, "files/{n}.bin");
    }
}

#[tokio::test]
async fn an_unchanged_installation_costs_the_directory_and_the_manifest() {
    let root = tempdir().unwrap();
    let (bytes, contents) = bundle(root.path(), 8, 200_000, 1);
    let weight = bytes.len();
    let (url, server) = serve(server(bytes));

    install_from(&url).await.unwrap();
    assert_installed(root.path(), &contents);
    // The directory, the head and manifest, and each blob once.
    assert_eq!(requests(&server), 2 + contents.len());
    assert!(sent(&server) < weight + 70_000, "{}", sent(&server));

    reset(&server);
    install_from(&url).await.unwrap();
    assert_installed(root.path(), &contents);
    assert_eq!(requests(&server), 2, "{:?}", server.lock().unwrap().asked);
    assert!(sent(&server) < 70_000, "sent {} of {weight}", sent(&server));
}

#[tokio::test]
async fn a_missing_file_is_asked_for_alone() {
    let root = tempdir().unwrap();
    let (bytes, contents) = bundle(root.path(), 8, 200_000, 2);
    let (url, server) = serve(server(bytes));
    install_from(&url).await.unwrap();

    std::fs::remove_file(root.path().join("files/3.bin")).unwrap();
    std::fs::write(root.path().join("files/5.bin"), b"edited").unwrap();
    reset(&server);
    install_from(&url).await.unwrap();
    assert_installed(root.path(), &contents);
    let asked = server.lock().unwrap().asked.clone();
    assert_eq!(asked.len(), 4, "{asked:?}");
    // Two blobs' worth, and no more.
    let blobs: usize = asked[2..].iter().map(|(_, n)| n).sum();
    assert!(blobs > 400_000 && blobs < 401_000, "{asked:?}");
}

#[tokio::test]
async fn a_bundle_republished_halfway_is_refused_not_mixed() {
    let root = tempdir().unwrap();
    let (old, _) = bundle(root.path(), 4, 50_000, 3);
    let (new, _) = bundle(root.path(), 4, 50_000, 30);
    let mut state = server(old);
    // Replaced after the directory and the manifest are read.
    state.republish = Some((2, new));
    let (url, _server) = serve(state);

    let error = install_from(&url).await.unwrap_err();
    assert!(
        matches!(error, InstallError::Republished { status: 200, .. }),
        "{error}"
    );
    // Nothing of the new bundle is under the old one's names.
    assert!(!root.path().join("files/0.bin").exists());
}

#[tokio::test]
async fn a_server_that_serves_no_ranges_is_downloaded_from_whole() {
    let root = tempdir().unwrap();
    let (bytes, contents) = bundle(root.path(), 3, 50_000, 4);
    let weight = bytes.len();
    let mut state = server(bytes);
    state.ranges = false;
    let (url, server) = serve(state);

    install_from(&url).await.unwrap();
    assert_installed(root.path(), &contents);
    assert_eq!(
        *server.lock().unwrap().asked,
        [("bytes=-65536".to_owned(), weight)]
    );
}

#[tokio::test]
async fn ranges_that_name_no_version_are_not_trusted_to_be_one_file() {
    let root = tempdir().unwrap();
    let (bytes, contents) = bundle(root.path(), 3, 50_000, 5);
    let weight = bytes.len();
    let mut state = server(bytes);
    state.validator = false;
    let (url, server) = serve(state);

    install_from(&url).await.unwrap();
    assert_installed(root.path(), &contents);
    let asked = server.lock().unwrap().asked.clone();
    assert_eq!(asked.len(), 2, "{asked:?}");
    assert_eq!(
        asked[1],
        (String::new(), weight),
        "then the whole file, once"
    );
}

#[tokio::test]
async fn a_directory_longer_than_the_first_tail_is_asked_for_once_more() {
    let root = tempdir().unwrap();
    // About a hundred and twenty bytes of directory per blob.
    let (bytes, contents) = bundle(root.path(), 900, 10, 6);
    let (url, server) = serve(server(bytes));

    install_from(&url).await.unwrap();
    assert_installed(root.path(), &contents);
    reset(&server);
    install_from(&url).await.unwrap();
    let asked = server.lock().unwrap().asked.clone();
    assert_eq!(asked.len(), 3, "a second tail, then the front: {asked:?}");
    assert!(asked[1].1 > 65_536, "{asked:?}");
}

#[tokio::test]
async fn the_manifest_alone_is_read_without_a_blob() {
    let root = tempdir().unwrap();
    let (bytes, _) = bundle(root.path(), 4, 200_000, 7);
    let (url, server) = serve(server(bytes));

    let manifest = resolve_manifest(ManifestSource::url(&url)).await.unwrap();
    assert_eq!(manifest.artifacts.len(), 4);
    assert_eq!(requests(&server), 2);
    assert!(sent(&server) < 70_000);
}

#[tokio::test]
async fn what_is_not_a_bundle_or_not_there_is_refused() {
    let (url, _) = serve(server(noise(300_000, 8)));
    let error = install_from(&url).await.unwrap_err();
    assert!(error.to_string().contains("no zip directory"), "{error}");

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut line = String::new();
            while reader.read_line(&mut line).unwrap() > 2 {
                line.clear();
            }
            let _ = stream.write_all(
                b"HTTP/1.1 404 Not Found\r\ncontent-length: 4\r\nconnection: close\r\n\r\ngone",
            );
        }
    });
    let error = install_from(&format!("{base}/game.opys"))
        .await
        .unwrap_err();
    assert!(
        matches!(&error, InstallError::Network { status: 404, body, .. } if body == "gone"),
        "{error:?}"
    );
}

#[tokio::test]
async fn a_range_answered_short_is_refused() {
    let root = tempdir().unwrap();
    let (bytes, _) = bundle(root.path(), 2, 1_000, 9);
    let mut state = server(bytes);
    // The front: the head and the manifest, a byte short.
    state.short = Some(1);
    let (url, _server) = serve(state);

    let error = install_from(&url).await.unwrap_err();
    assert!(
        matches!(&error, InstallError::Network { status: 206, body, .. } if body.contains("was sent")),
        "{error:?}"
    );
}
