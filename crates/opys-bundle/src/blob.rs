//! Blobs: files a manifest carries rather than points at.
//!
//! A blob is named by the sha256 of its bytes and by nothing else. The
//! manifest says *which* bytes ([`opys_core::Source::Blob`]); where they are kept
//! is the business of whoever holds the manifest — an entry of a bundle once
//! it is published, and before that a [`BlobSource`] on the building machine.

use std::collections::BTreeMap;
use std::io::{self, Read};
use std::path::PathBuf;

use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// The id of the blob holding exactly `bytes`.
pub fn blob_id(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

/// The id and length of the blob holding what `reader` yields, without
/// holding it in memory.
pub fn blob_id_of(mut reader: impl Read) -> io::Result<(String, u64)> {
    let mut hasher = Sha256::new();
    let size = io::copy(&mut reader, &mut hasher)?;
    Ok((hex::encode(hasher.finalize()), size))
}

/// Where a blob's bytes are before the manifest is published: a file on this
/// machine, or bytes a plugin produced. This is build-machine state and is
/// never part of a manifest — which is the whole difference from the `file`
/// and `bytes` sources it replaces.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "BlobSourceWire", into = "BlobSourceWire")]
pub enum BlobSource {
    File(PathBuf),
    Bytes(Vec<u8>),
}

/// Discriminated by which field is present, like every wire shape here.
/// `bytes` is base64, since this crosses napi as JSON. A struct of options
/// rather than an untagged enum, so a wrong shape is told the right ones.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct BlobSourceWire {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    file: Option<PathBuf>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "base64_bytes"
    )]
    bytes: Option<Vec<u8>>,
}

impl TryFrom<BlobSourceWire> for BlobSource {
    type Error = &'static str;

    fn try_from(raw: BlobSourceWire) -> Result<Self, Self::Error> {
        match (raw.file, raw.bytes) {
            (Some(file), None) => Ok(BlobSource::File(file)),
            (None, Some(bytes)) => Ok(BlobSource::Bytes(bytes)),
            _ => Err("a blob is kept as `{ file }` or as `{ bytes }`"),
        }
    }
}

impl From<BlobSource> for BlobSourceWire {
    fn from(source: BlobSource) -> Self {
        match source {
            BlobSource::File(file) => BlobSourceWire {
                file: Some(file),
                bytes: None,
            },
            BlobSource::Bytes(bytes) => BlobSourceWire {
                file: None,
                bytes: Some(bytes),
            },
        }
    }
}

mod base64_bytes {
    use super::*;
    use serde::{Deserializer, Serializer};

    const ENGINE: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

    pub fn serialize<S: Serializer>(
        bytes: &Option<Vec<u8>>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        match bytes {
            Some(bytes) => serializer.serialize_str(&ENGINE.encode(bytes)),
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Option<Vec<u8>>, D::Error> {
        let text = String::deserialize(deserializer)?;
        ENGINE
            .decode(text)
            .map(Some)
            .map_err(serde::de::Error::custom)
    }
}

/// Blob id → where its bytes are. Ordered, because a bundle is written from
/// it and must not differ between two builds of the same thing.
pub type Blobs = BTreeMap<String, BlobSource>;
