//! A bundle's head, read without its manifest: what a launcher asks for
//! before it installs anything, since the head holds the options a player
//! may set. An install never reads it.

use futures::StreamExt;
use opys_bundle::{head_from_front, read_bundle_head, Front, Head};

use crate::errors::InstallError;
use crate::fetch::{fetch_front, RetryOptions};
use crate::phases::resolve::ManifestSource;

/// Asked for first. A head with no options is under a hundred bytes and one
/// with a screen of them a few kilobytes, so this is one request for nearly
/// every bundle.
const FIRST_ASK: u64 = 16 * 1024;

/// The most a head is read to. It comes from somebody else's server and
/// says its own size, which is not a reason to hold whatever it says.
const LARGEST_HEAD: u64 = 16 * 1024 * 1024;

/// Up to `len` bytes off the front of `url`.
async fn front(url: &str, len: u64) -> Result<Vec<u8>, InstallError> {
    let network = |status: u16, body: String| InstallError::Network {
        url: url.to_owned(),
        status,
        body,
    };
    let res = fetch_front(url, len, RetryOptions::default())
        .await
        .map_err(|e| network(0, e.to_string()))?;
    let status = res.status();
    if !status.is_success() {
        return Err(network(
            status.as_u16(),
            res.text().await.unwrap_or_default(),
        ));
    }
    // The server may have ignored the range and be sending the whole bundle:
    // reading stops at `len` and dropping the stream ends the transfer.
    let mut bytes = Vec::new();
    let mut stream = res.bytes_stream();
    while (bytes.len() as u64) < len {
        let Some(chunk) = stream.next().await else {
            break;
        };
        bytes.extend_from_slice(&chunk.map_err(|e| network(0, e.to_string()))?);
    }
    bytes.truncate(len as usize);
    Ok(bytes)
}

async fn head_at(url: &str) -> Result<Head, InstallError> {
    let mut ask = FIRST_ASK;
    loop {
        let bytes = front(url, ask).await?;
        match head_from_front(&bytes)? {
            Front::Head(head) => return Ok(head),
            // The file ended before its own head did.
            Front::Needs(_) if (bytes.len() as u64) < ask => {
                return Err(InstallError::Manifest(format!(
                    "{url} is not a bundle: it ends inside its head"
                )));
            }
            Front::Needs(needs) if needs > LARGEST_HEAD => {
                return Err(InstallError::Manifest(format!(
                    "{url} says its head takes {needs} bytes, which is more than a head is read to"
                )));
            }
            Front::Needs(needs) => ask = needs,
        }
    }
}

/// The head of the bundle `source` names, with its manifest left unread and,
/// behind a URL, undownloaded: only the front of the file is asked for.
///
/// `None` for a manifest in memory, which is in no bundle and so has no head.
pub async fn read_head(source: &ManifestSource) -> Result<Option<Head>, InstallError> {
    match source {
        ManifestSource::Manifest(_) => Ok(None),
        ManifestSource::Bundle(path) => {
            let file = std::fs::File::open(path).map_err(|source| InstallError::Io {
                path: path.display().to_string(),
                source,
            })?;
            Ok(Some(read_bundle_head(file)?))
        }
        ManifestSource::Url(url) => head_at(url).await.map(Some),
    }
}
