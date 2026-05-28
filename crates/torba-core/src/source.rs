use base64::Engine;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Source {
    Url { url: String },
    File { file: String },
    String { string: String },
    Bytes { bytes: String },
    Pointer { pointer: String },
}

impl Source {
    /// Construct a `Bytes` source from raw bytes, base64-encoding for transit.
    pub fn from_bytes(bytes: &[u8]) -> Self {
        Source::Bytes {
            bytes: base64::engine::general_purpose::STANDARD.encode(bytes),
        }
    }
}

/// Wire shape — discriminated by which field is present, NOT by a `kind` tag.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SourceWire {
    Url { url: String },
    File { file: String },
    String { string: String },
    Bytes { bytes: String },
    Pointer { pointer: String },
}

pub fn decode_source(raw: SourceWire) -> Source {
    match raw {
        SourceWire::Url { url } => Source::Url { url },
        SourceWire::File { file } => Source::File { file },
        SourceWire::String { string } => Source::String { string },
        SourceWire::Bytes { bytes } => Source::Bytes { bytes },
        SourceWire::Pointer { pointer } => Source::Pointer { pointer },
    }
}

pub fn encode_source(source: &Source) -> SourceWire {
    match source {
        Source::Url { url } => SourceWire::Url { url: url.clone() },
        Source::File { file } => SourceWire::File { file: file.clone() },
        Source::String { string } => SourceWire::String {
            string: string.clone(),
        },
        Source::Bytes { bytes } => SourceWire::Bytes {
            bytes: bytes.clone(),
        },
        Source::Pointer { pointer } => SourceWire::Pointer {
            pointer: pointer.clone(),
        },
    }
}
