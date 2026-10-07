//! Pinning a file nobody published a hash for.
//!
//! Most providers say what a file's hash is. For a plain URL there is nobody
//! to ask, so the file is downloaded once, at build time, and hashed. The
//! manifest then carries that hash, and every install is held to the bytes
//! that were seen here — which is the whole of what the old install-time
//! `discovery` could not offer.

use sha2::{Digest, Sha256};

use crate::http::{get_bytes, HttpError};

/// What a download turned out to be.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pinned {
    pub size: u64,
    /// sha256, lower-case hex.
    pub sha256: String,
}

#[derive(Debug, thiserror::Error)]
pub enum PinError {
    #[error(transparent)]
    Transport(#[from] HttpError),
    #[error("{url} returned HTTP {status}")]
    Status { url: String, status: u16 },
}

/// The sha256 of `bytes`, lower-case hex.
pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

/// Download `url` and report its size and sha256.
pub fn pin_url(url: &str, headers: &[(&str, &str)]) -> Result<Pinned, PinError> {
    let response = get_bytes(url, headers)?;
    if !response.ok() {
        return Err(PinError::Status {
            url: url.to_owned(),
            status: response.status,
        });
    }
    Ok(Pinned {
        size: response.body.len() as u64,
        sha256: sha256_hex(&response.body),
    })
}
