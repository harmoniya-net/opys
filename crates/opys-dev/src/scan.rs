//! A local directory, as artifacts.
//!
//! Two steps, because the step between them is the config author's: where
//! each file goes, and for a published file where it is fetched from, are
//! templates or functions in the config and cannot cross into here. So
//! [`scan_directory`] says what is on disk, the caller places each file, and
//! [`scanned_files`] hashes them and builds the artifacts.

use std::fs::File;
use std::io::{self, Read};
use std::path::{Path, PathBuf};

use opys_core::{blob_id_of, Artifact, BlobSource, HashEntry, Integrity, Source};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use sha2::Sha256;

use crate::contribution::Contribution;

#[derive(Debug, thiserror::Error)]
pub enum ScanError {
    #[error("cannot read {path}: {source}")]
    Io {
        path: String,
        #[source]
        source: io::Error,
    },
}

fn io_at(path: &Path) -> impl FnOnce(io::Error) -> ScanError + '_ {
    move |source| ScanError::Io {
        path: path.display().to_string(),
        source,
    }
}

/// One file found under the scanned directory.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScannedFile {
    /// Path relative to the directory, `/`-separated on every platform.
    pub rel: String,
    /// Directory portion of `rel`; empty at the root.
    pub dir: String,
    /// Final path segment.
    pub filename: String,
    /// Absolute path on the build machine.
    pub abs: PathBuf,
    pub size: u64,
}

fn walk(root: &Path, dir: &Path, out: &mut Vec<ScannedFile>) -> Result<(), ScanError> {
    for entry in std::fs::read_dir(dir).map_err(io_at(dir))? {
        let entry = entry.map_err(io_at(dir))?;
        let abs = entry.path();
        // Not followed: a symlink is neither a file nor a directory here, so
        // a link out of the tree cannot pull the rest of the disk into it.
        let kind = entry.file_type().map_err(io_at(&abs))?;
        if kind.is_dir() {
            walk(root, &abs, out)?;
        } else if kind.is_file() {
            let size = entry.metadata().map_err(io_at(&abs))?.len();
            let parts: Vec<String> = abs
                .strip_prefix(root)
                .unwrap_or(&abs)
                .components()
                .map(|part| part.as_os_str().to_string_lossy().into_owned())
                .collect();
            let (filename, dirs) = parts.split_last().expect("a file has a name");
            out.push(ScannedFile {
                rel: parts.join("/"),
                dir: dirs.join("/"),
                filename: filename.clone(),
                abs,
                size,
            });
        }
    }
    Ok(())
}

/// Every regular file under `root`, in `rel` order.
///
/// Sorted, because a directory listing is in whatever order the filesystem
/// keeps it and the result reaches a manifest, which must not differ between
/// two builds of the same tree.
pub fn scan_directory(root: &Path) -> Result<Vec<ScannedFile>, ScanError> {
    let mut files = Vec::new();
    walk(root, root, &mut files)?;
    files.sort_by(|a, b| a.rel.cmp(&b.rel));
    Ok(files)
}

/// The hash a published file is pinned with.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScanHash {
    #[default]
    Sha1,
    Sha256,
}

/// A scanned file with its place in the installation decided.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlacedFile {
    /// Where the file is on this machine.
    pub abs: PathBuf,
    /// Where it is installed.
    pub path: String,
    /// Where an installer fetches it from. With one, the file is published
    /// elsewhere and the artifact points at it; without, the file travels
    /// with the manifest as a blob.
    #[serde(default)]
    pub url: Option<String>,
}

/// The digest and length of a file, read once.
fn digest<D: Digest>(path: &Path) -> Result<(String, u64), ScanError> {
    let mut file = File::open(path).map_err(io_at(path))?;
    let mut hasher = D::new();
    let mut buffer = [0u8; 64 * 1024];
    let mut size = 0u64;
    loop {
        let read = file.read(&mut buffer).map_err(io_at(path))?;
        if read == 0 {
            return Ok((hex::encode(hasher.finalize()), size));
        }
        hasher.update(&buffer[..read]);
        size += read as u64;
    }
}

/// The artifacts, and the blobs behind them, of a scanned directory.
///
/// Every file is hashed, including one that is only pointed at: an artifact
/// with no hash is trusted by path alone and never re-fetched, so a changed
/// file would never reach anyone who already had the old one. The size is the
/// length that was hashed, not the one the directory listing reported.
pub fn scanned_files(files: &[PlacedFile], hash: ScanHash) -> Result<Contribution, ScanError> {
    let mut contribution = Contribution::default();
    for file in files {
        let artifact = match &file.url {
            None => {
                let (id, size) = blob_id_of(File::open(&file.abs).map_err(io_at(&file.abs))?)
                    .map_err(io_at(&file.abs))?;
                contribution
                    .blobs
                    .insert(id.clone(), BlobSource::File(file.abs.clone()));
                Artifact::blob(&file.path, id, size)
            }
            Some(url) => {
                let (entry, size) = match hash {
                    ScanHash::Sha1 => {
                        let (sha1, size) = digest::<Sha1>(&file.abs)?;
                        (HashEntry::Sha1 { sha1 }, size)
                    }
                    ScanHash::Sha256 => {
                        let (sha256, size) = digest::<Sha256>(&file.abs)?;
                        (HashEntry::Sha256 { sha256 }, size)
                    }
                };
                Artifact {
                    path: file.path.clone(),
                    source: Source::Url { url: url.clone() },
                    size: Some(size),
                    rules: Vec::new(),
                    integrity: Some(Integrity::One(entry)),
                    metadata: None,
                    extract: None,
                }
            }
        };
        contribution.artifacts.push(artifact);
    }
    Ok(contribution)
}
