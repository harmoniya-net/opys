use serde::{Deserialize, Serialize};

/// Where a discovered hash sits, keyed by algorithm. The string is a
/// *location* (header name or URL), not the hash itself.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum HashRef {
    Sha256 { sha256: String },
    Sha1 { sha1: String },
    Md5 { md5: String },
}

impl HashRef {
    pub fn algo(&self) -> crate::HashAlgo {
        match self {
            HashRef::Sha256 { .. } => crate::HashAlgo::Sha256,
            HashRef::Sha1 { .. } => crate::HashAlgo::Sha1,
            HashRef::Md5 { .. } => crate::HashAlgo::Md5,
        }
    }
    pub fn location(&self) -> &str {
        match self {
            HashRef::Sha256 { sha256 } => sha256,
            HashRef::Sha1 { sha1 } => sha1,
            HashRef::Md5 { md5 } => md5,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct IntegrityProbes {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub header: Option<HashRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<HashRef>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SizeProbes {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub header: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Discovery {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub integrity: Option<IntegrityProbes>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<SizeProbes>,
}
