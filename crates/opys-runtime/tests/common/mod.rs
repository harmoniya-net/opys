//! What the runtime's tests share: a blob table that fills in as a manifest
//! is written down, and a loopback server for the sources that are URLs.
#![allow(dead_code)]

use std::cell::RefCell;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::path::Path;

use opys_bundle::{blob_id, BlobSource, Blobs};

thread_local! {
    // Each `#[tokio::test]` runs on its own thread, so a table per thread is
    // a table per test.
    static BLOBS: RefCell<Blobs> = const { RefCell::new(Blobs::new()) };
}

fn register(id: String, source: BlobSource) -> String {
    BLOBS.with(|blobs| blobs.borrow_mut().insert(id.clone(), source));
    id
}

/// The id of the blob holding `content`, which the next install can read.
pub fn blob(content: &str) -> String {
    register(
        blob_id(content.as_bytes()),
        BlobSource::Bytes(content.into()),
    )
}

/// The id of the blob that is the file at `path`.
pub fn blob_file(path: &Path) -> String {
    register(
        blob_id(&std::fs::read(path).unwrap()),
        BlobSource::File(path.to_owned()),
    )
}

/// The table built up so far, leaving it in place for a second install.
pub fn blobs() -> Blobs {
    BLOBS.with(|blobs| blobs.borrow().clone())
}

/// `manifest` and the blobs written down so far as a bundle on disk, which
/// is the one thing a blob can be installed from. The file outlives the
/// test that asked for it.
#[allow(dead_code)]
pub fn bundled(manifest: &opys_core::Manifest) -> opys_runtime::ManifestSource {
    let file = tempfile::NamedTempFile::new().unwrap();
    opys_bundle::write_bundle(file.as_file(), manifest, &blobs()).unwrap();
    let (_, path) = file.keep().unwrap();
    opys_runtime::ManifestSource::bundle(path)
}

/// Serve `files` (path → body) over loopback until the process ends, and
/// return the base URL. Anything else is a 404.
pub fn serve(files: Vec<(&'static str, Vec<u8>)>) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut request = String::new();
            reader.read_line(&mut request).unwrap();
            let mut header = String::new();
            while reader.read_line(&mut header).unwrap() > 2 {
                header.clear();
            }
            let target = request.split_whitespace().nth(1).unwrap_or_default();
            let (status, body): (&str, &[u8]) = match files.iter().find(|(path, _)| *path == target)
            {
                Some((_, body)) => ("200 OK", body),
                None => ("404 Not Found", b"no such file"),
            };
            let head = format!(
                "HTTP/1.1 {status}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(head.as_bytes());
            let _ = stream.write_all(body);
        }
    });
    base
}
