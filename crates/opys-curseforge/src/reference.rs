//! What a config may name a CurseForge file by.

use serde::{Deserialize, Serialize};

use crate::error::CurseForgeError;

/// A CurseForge file: its numeric id, or the file's page
/// (`https://www.curseforge.com/<…>/files/<id>`), so a config can paste the
/// link as it is.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FileRef {
    Id(u64),
    Url(String),
}

impl FileRef {
    /// The file id. A string has to contain `/files/<digits>`; anything else
    /// is refused rather than guessed at.
    pub fn id(&self) -> Result<u64, CurseForgeError> {
        match self {
            FileRef::Id(id) => Ok(*id),
            FileRef::Url(url) => url
                .split_once("/files/")
                .map(|(_, after)| {
                    let end = after
                        .find(|c: char| !c.is_ascii_digit())
                        .unwrap_or(after.len());
                    &after[..end]
                })
                .and_then(|digits| digits.parse().ok())
                .ok_or_else(|| CurseForgeError::BadFileRef(url.clone())),
        }
    }
}
