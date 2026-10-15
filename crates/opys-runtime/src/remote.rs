//! A bundle behind a URL, read in pieces.
//!
//! An install used to download the whole bundle before it looked at the
//! manifest, so a launch that changed nothing cost the bundle's weight every
//! time. Now the zip's directory is asked for off the end of the file, the
//! head and manifest are asked for next, and a blob only when the install
//! finds its file missing or stale: an unchanged installation costs the
//! directory and the manifest, a few hundred kilobytes, whatever the
//! bundle weighs. What the zip says is `opys-bundle`'s to read
//! ([`directory_from_back`]); here are only the requests.
//!
//! Every request after the first is pinned to the file the first one read,
//! by `If-Range`: a bundle republished halfway through an install is refused,
//! not installed as half of one and half of the other. A server that cannot
//! be pinned that way — it serves no ranges, or names no version of its file
//! — has its bundle downloaded whole, which is what HTTP leaves a client.

use std::io::Write as _;
use std::path::Path;

use futures::StreamExt;
use opys_bundle::{directory_from_back, Back, Directory};
use opys_core::Manifest;
use reqwest::header::{HeaderMap, CONTENT_RANGE, ETAG, LAST_MODIFIED};
use reqwest::{Response, StatusCode};
use tokio::io::AsyncWriteExt;

use crate::errors::InstallError;
use crate::fetch::{fetch_range, fetch_with_retry, RetryOptions};

/// Asked for first, off the end. A bundle's directory takes about a hundred
/// bytes per entry, so this holds it for a bundle of hundreds of files, and
/// one with more says how much more to ask for.
const FIRST_TAIL: u64 = 64 * 1024;

/// One version of the file behind a URL: every range asked of it is of that
/// version or refused.
struct Pinned {
    url: String,
    validator: String,
    len: u64,
}

/// A bundle read in pieces: which file it is, and where its entries are.
pub(crate) struct Remote {
    file: Pinned,
    directory: Directory,
}

/// What opening a URL gave.
pub(crate) enum Opened {
    Remote(Remote, Box<Manifest>),
    /// The bundle, downloaded whole: the server could not be read in pieces.
    Whole(tempfile::TempPath),
}

fn network(url: &str, status: u16, body: impl Into<String>) -> InstallError {
    InstallError::Network {
        url: url.to_owned(),
        status,
        body: body.into(),
    }
}

/// The version of the file a response is of, as `If-Range` takes it: a
/// strong `ETag`, or else the `Last-Modified` date. A weak tag cannot pin a
/// range, by the HTTP spec.
fn validator(headers: &HeaderMap) -> Option<String> {
    let header = |name| headers.get(name).and_then(|value| value.to_str().ok());
    header(ETAG)
        .filter(|tag| !tag.starts_with("W/"))
        .or_else(|| header(LAST_MODIFIED))
        .map(str::to_owned)
}

/// The length of the whole file, off a `Content-Range: bytes a-b/len`.
fn file_len(headers: &HeaderMap) -> Option<u64> {
    headers
        .get(CONTENT_RANGE)?
        .to_str()
        .ok()?
        .rsplit_once('/')?
        .1
        .parse()
        .ok()
}

/// A response, unless it is a refusal: then the error it is, with its body.
async fn success(url: &str, res: Response) -> Result<Response, InstallError> {
    let status = res.status();
    if status.is_success() {
        return Ok(res);
    }
    Err(network(
        url,
        status.as_u16(),
        res.text().await.unwrap_or_default(),
    ))
}

async fn body(url: &str, res: Response) -> Result<Vec<u8>, InstallError> {
    res.bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|e| network(url, 0, e.to_string()))
}

/// A response's body, written to a temporary file.
async fn to_temp(url: &str, res: Response) -> Result<tempfile::TempPath, InstallError> {
    let mut file = tempfile::NamedTempFile::new().map_err(|source| InstallError::Io {
        path: std::env::temp_dir().display().to_string(),
        source,
    })?;
    let mut stream = res.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| network(url, 0, e.to_string()))?;
        file.write_all(&chunk).map_err(|source| InstallError::Io {
            path: file.path().display().to_string(),
            source,
        })?;
    }
    Ok(file.into_temp_path())
}

impl Pinned {
    /// `range` of this version of the file, and nothing else: a server that
    /// sends anything but that range of that version is refused.
    async fn range(&self, range: std::ops::Range<u64>) -> Result<Vec<u8>, InstallError> {
        let res = self.ask(range.clone()).await?;
        let bytes = body(&self.url, res).await?;
        if bytes.len() as u64 != range.end - range.start {
            return Err(network(
                &self.url,
                206,
                format!(
                    "asked for {} bytes and was sent {}",
                    range.end - range.start,
                    bytes.len()
                ),
            ));
        }
        Ok(bytes)
    }

    async fn ask(&self, range: std::ops::Range<u64>) -> Result<Response, InstallError> {
        let asked = format!("bytes={}-{}", range.start, range.end - 1);
        let res = fetch_range(
            &self.url,
            &asked,
            Some(&self.validator),
            RetryOptions::default(),
        )
        .await
        .map_err(|e| network(&self.url, 0, e.to_string()))?;
        let res = success(&self.url, res).await?;
        if res.status() != StatusCode::PARTIAL_CONTENT || file_len(res.headers()) != Some(self.len)
        {
            return Err(InstallError::Republished {
                url: self.url.clone(),
                status: res.status().as_u16(),
            });
        }
        Ok(res)
    }

    /// Where every entry is, from as much of the tail as that takes. Each
    /// asking is for more than the last, and gets exactly that, so this ends.
    async fn directory(&self, mut tail: Vec<u8>) -> Result<Directory, InstallError> {
        loop {
            match directory_from_back(&tail, self.len)? {
                Back::Directory(directory) => return Ok(directory),
                Back::Needs(needs) => tail = self.range(self.len - needs..self.len).await?,
            }
        }
    }
}

impl Remote {
    /// Write the blob `id` to `dest`, decoding it as it arrives, and report
    /// how much of it has been written. Returns its length.
    pub(crate) async fn copy_to(
        &self,
        id: &str,
        dest: &Path,
        on_bytes: &(dyn Fn(u64) + Send + Sync),
    ) -> Result<u64, InstallError> {
        let entry = self.directory.blob(id)?;
        let res = self.file.ask(entry.range()).await?;
        let io = |source| InstallError::Io {
            path: dest.display().to_string(),
            source,
        };
        let mut out = tokio::fs::File::create(dest).await.map_err(io)?;
        let mut decoder = entry.decoder(Vec::new());
        let mut written = 0u64;
        let mut stream = res.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| network(&self.file.url, 0, e.to_string()))?;
            decoder
                .write_all(&chunk)
                .map_err(opys_bundle::BundleError::from)?;
            let decoded = std::mem::take(decoder.get_mut());
            out.write_all(&decoded).await.map_err(io)?;
            written += decoded.len() as u64;
            on_bytes(written);
        }
        let last = decoder.finish()?;
        out.write_all(&last).await.map_err(io)?;
        out.flush().await.map_err(io)?;
        Ok(written + last.len() as u64)
    }
}

/// Open the bundle at `url`, with its manifest read and its blobs left where
/// they are.
pub(crate) async fn open(url: &str) -> Result<Opened, InstallError> {
    let res = fetch_range(
        url,
        &format!("bytes=-{FIRST_TAIL}"),
        None,
        RetryOptions::default(),
    )
    .await
    .map_err(|e| network(url, 0, e.to_string()))?;
    let res = success(url, res).await?;
    // No range: the server sent the file, and it is downloaded whole.
    if res.status() != StatusCode::PARTIAL_CONTENT {
        return to_temp(url, res).await.map(Opened::Whole);
    }
    let (Some(len), Some(validator)) = (file_len(res.headers()), validator(res.headers())) else {
        // Ranges with no version of the file to pin them to: two of them
        // need not be of one file, so the bundle is read in one.
        drop(res);
        return whole(url).await.map(Opened::Whole);
    };
    let file = Pinned {
        url: url.to_owned(),
        validator,
        len,
    };
    let directory = file.directory(body(url, res).await?).await?;
    let front = file.range(directory.front()?).await?;
    let manifest = directory.open(&front)?;
    Ok(Opened::Remote(
        Remote { file, directory },
        Box::new(manifest),
    ))
}

/// The bundle at `url`, downloaded whole to a temporary file.
pub(crate) async fn whole(url: &str) -> Result<tempfile::TempPath, InstallError> {
    let res = fetch_with_retry(reqwest::Method::GET, url, RetryOptions::default())
        .await
        .map_err(|e| network(url, 0, e.to_string()))?;
    to_temp(url, success(url, res).await?).await
}
