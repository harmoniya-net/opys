use serde::{Deserialize, Serialize};

/// Where an artifact's bytes come from. There are two answers and no third:
/// somewhere on the network, or in the bundle the manifest came in.
///
/// The format used to have three more — a path on the local machine, and text
/// or base64 written straight into the manifest. All three are what a blob
/// is for, and a blob does not make the manifest grow with what it carries.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "SourceWire", into = "SourceWire")]
pub enum Source {
    Url {
        url: String,
    },
    /// A blob, named by the lowercase hex sha256 of its bytes. The name is
    /// the content, so it says nothing of where the bytes are kept: an entry
    /// of a bundle, or a file on the machine that built the manifest.
    Blob {
        blob: String,
    },
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum SourceError {
    #[error("a source names a `url` or a `blob`, and this one names neither")]
    Empty,
    #[error("a source names a `url` or a `blob`, not both")]
    Both,
    #[error("`{0}` is not a blob id: a blob is named by the lowercase hex sha256 of its bytes")]
    BlobId(String),
}

/// Wire shape — discriminated by which field is present, NOT by a `kind` tag.
/// A struct rather than an untagged enum so that a field this reader does not
/// know — `file`, `string`, `bytes` — is refused by name.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SourceWire {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    blob: Option<String>,
}

impl TryFrom<SourceWire> for Source {
    type Error = SourceError;

    fn try_from(raw: SourceWire) -> Result<Self, Self::Error> {
        match (raw.url, raw.blob) {
            (Some(url), None) => Ok(Source::Url { url }),
            (None, Some(blob)) if is_blob_id(&blob) => Ok(Source::Blob { blob }),
            (None, Some(blob)) => Err(SourceError::BlobId(blob)),
            (None, None) => Err(SourceError::Empty),
            (Some(_), Some(_)) => Err(SourceError::Both),
        }
    }
}

impl From<Source> for SourceWire {
    fn from(s: Source) -> Self {
        match s {
            Source::Url { url } => SourceWire {
                url: Some(url),
                blob: None,
            },
            Source::Blob { blob } => SourceWire {
                url: None,
                blob: Some(blob),
            },
        }
    }
}

/// Lowercase hex sha256 — the only spelling of a blob id.
pub fn is_blob_id(id: &str) -> bool {
    id.len() == 64 && id.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}
