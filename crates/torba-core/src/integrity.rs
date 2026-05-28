use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum HashEntry {
    Sha256 { sha256: String },
    Sha1 { sha1: String },
    Md5 { md5: String },
}

/// One entry, multiple entries, or omitted (= skip verification).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Integrity {
    One(HashEntry),
    Many(Vec<HashEntry>),
}

impl Integrity {
    /// Borrow as a slice of hash entries — `One` becomes a one-element slice.
    pub fn entries(&self) -> &[HashEntry] {
        match self {
            Integrity::One(h) => std::slice::from_ref(h),
            Integrity::Many(v) => v.as_slice(),
        }
    }

    /// Collapse a single-element list back to a bare entry.
    pub fn collapsed(self) -> Self {
        match self {
            Integrity::Many(mut v) if v.len() == 1 => Integrity::One(v.pop().unwrap()),
            other => other,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HashAlgo {
    Sha1,
    Sha256,
    Md5,
}

impl HashAlgo {
    pub fn hex_len(self) -> usize {
        match self {
            HashAlgo::Sha1 => 40,
            HashAlgo::Sha256 => 64,
            HashAlgo::Md5 => 32,
        }
    }
}

impl HashEntry {
    pub fn algo(&self) -> HashAlgo {
        match self {
            HashEntry::Sha256 { .. } => HashAlgo::Sha256,
            HashEntry::Sha1 { .. } => HashAlgo::Sha1,
            HashEntry::Md5 { .. } => HashAlgo::Md5,
        }
    }

    pub fn hex(&self) -> &str {
        match self {
            HashEntry::Sha256 { sha256 } => sha256,
            HashEntry::Sha1 { sha1 } => sha1,
            HashEntry::Md5 { md5 } => md5,
        }
    }
}
