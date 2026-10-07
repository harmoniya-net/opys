use std::io::{Cursor, Read};

use opys_core::{Artifact, ExtractRule, ExtractScan, HashEntry, Integrity, Source};
use sha1::{Digest, Sha1};

#[derive(Debug, thiserror::Error)]
pub enum ArchiveError {
    #[error("{what} is not a readable zip archive: {reason}")]
    Unreadable { what: String, reason: String },
    #[error("{what} is missing {entry}")]
    MissingEntry { what: String, entry: String },
}

/// A modpack archive, downloaded and held in memory.
///
/// It is fetched at build time for one reason — the pack's index is inside it
/// — and then described to the runtime as an artifact, which downloads it
/// again at install time to unpack the overrides. The bytes here are what that
/// artifact's size and hash are taken from, so the two downloads are held to
/// being the same file.
pub struct PackArchive {
    /// What to call it in an error: `.mrpack archive`, `CurseForge modpack .zip`.
    what: &'static str,
    url: String,
    bytes: Vec<u8>,
}

impl PackArchive {
    pub fn new(what: &'static str, url: impl Into<String>, bytes: Vec<u8>) -> Self {
        PackArchive {
            what,
            url: url.into(),
            bytes,
        }
    }

    /// The contents of the entry named `entry`.
    pub fn entry(&self, entry: &str) -> Result<Vec<u8>, ArchiveError> {
        let unreadable = |reason: String| ArchiveError::Unreadable {
            what: self.what.to_owned(),
            reason,
        };
        let mut archive = zip::ZipArchive::new(Cursor::new(&self.bytes))
            .map_err(|e| unreadable(e.to_string()))?;
        let mut file = match archive.by_name(entry) {
            Ok(file) => file,
            Err(zip::result::ZipError::FileNotFound) => {
                return Err(ArchiveError::MissingEntry {
                    what: self.what.to_owned(),
                    entry: entry.to_owned(),
                })
            }
            Err(e) => return Err(unreadable(e.to_string())),
        };
        let mut contents = Vec::new();
        file.read_to_end(&mut contents)
            .map_err(|e| unreadable(e.to_string()))?;
        Ok(contents)
    }

    /// The artifact that installs the pack's overrides: the archive itself,
    /// cached at `path`, with each of `directories` unpacked into the game
    /// directory and its own name stripped off the front.
    pub fn overrides(&self, path: &str, directories: &[&str]) -> Artifact {
        Artifact {
            path: path.to_owned(),
            source: Source::Url {
                url: self.url.clone(),
            },
            size: Some(self.bytes.len() as u64),
            rules: Vec::new(),
            integrity: Some(Integrity::One(HashEntry::Sha1 {
                sha1: hex::encode(Sha1::digest(&self.bytes)),
            })),
            metadata: None,
            extract: Some(
                directories
                    .iter()
                    .map(|directory| {
                        let prefix = format!("{directory}/");
                        ExtractRule::Scan(ExtractScan {
                            matches: prefix.clone(),
                            into: "${game_directory}".to_owned(),
                            strip: Some(vec![prefix]),
                            includes: None,
                            excludes: None,
                        })
                    })
                    .collect(),
            ),
        }
    }
}
