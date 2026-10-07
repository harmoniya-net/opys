//! The bundle: a manifest and the blobs it names, as one file.
//!
//! It is a zip, and deliberately nothing more — `unzip -l` reads it:
//!
//! ```text
//! opys.json        the head: format, vars, launch, restrict
//! artifacts.json   the artifact list
//! blobs/<sha256>   one entry per blob
//! ```
//!
//! The manifest is split in two because its two halves are read for different
//! reasons and are very different sizes. The list is megabytes — one line per
//! file of an installation — and only an installer wants it. The head is a few
//! kilobytes and is what anything else asks about, so it is the first entry
//! and is stored uncompressed: it can be read with one seek, or off the front
//! of the file by something that never parses a zip at all.
//!
//! The split is the container's and not the model's. Both halves decode into
//! one [`Manifest`], the same one a plain JSON document decodes into.

use std::collections::BTreeSet;
use std::fs::File;
use std::io::{self, Read, Seek, Write};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, DateTime, ZipArchive, ZipWriter};

use crate::artifact::Artifact;
use crate::blob::{BlobSource, Blobs};
use crate::launch::Launch;
use crate::manifest::Manifest;
use crate::valdefs::ValDefs;

/// The format this reader and writer speak. A bundle that says anything else
/// is refused before another byte of it is interpreted.
pub const BUNDLE_FORMAT: u32 = 1;

const HEAD_ENTRY: &str = "opys.json";
const ARTIFACTS_ENTRY: &str = "artifacts.json";

fn blob_entry(id: &str) -> String {
    format!("blobs/{id}")
}

#[derive(Debug, thiserror::Error)]
pub enum BundleError {
    #[error("not a bundle: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error(transparent)]
    Io(#[from] io::Error),
    #[error("not a bundle: it has no `{0}`")]
    MissingEntry(&'static str),
    #[error("`{entry}` does not parse: {source}")]
    Json {
        entry: &'static str,
        #[source]
        source: serde_json::Error,
    },
    #[error(
        "bundle format {found} is not one this reader knows (it reads format {BUNDLE_FORMAT})"
    )]
    Format { found: u64 },
    #[error("the manifest names blob {0}, and nothing holds it")]
    MissingBlob(String),
    #[error("blob {id} does not hold what its name says: its bytes hash to {found}")]
    BlobMismatch { id: String, found: String },
    #[error("cannot read blob {id} from {path}: {source}")]
    BlobFile {
        id: String,
        path: String,
        #[source]
        source: io::Error,
    },
}

/// Everything in a manifest but its artifact list.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "HeadWire", into = "HeadWire")]
pub struct Head {
    pub vars: ValDefs,
    pub launch: Option<Launch>,
    pub restrict: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct HeadWire {
    format: u32,
    #[serde(default)]
    vars: ValDefs,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    launch: Option<Launch>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    restrict: Option<Vec<String>>,
}

impl From<HeadWire> for Head {
    fn from(raw: HeadWire) -> Self {
        Head {
            vars: raw.vars,
            launch: raw.launch,
            restrict: raw.restrict,
        }
    }
}

impl From<Head> for HeadWire {
    fn from(head: Head) -> Self {
        HeadWire {
            format: BUNDLE_FORMAT,
            vars: head.vars,
            launch: head.launch,
            restrict: head.restrict.filter(|r| !r.is_empty()),
        }
    }
}

impl Manifest {
    /// The manifest without its artifact list.
    pub fn head(&self) -> Head {
        Head {
            vars: self.vars.clone(),
            launch: self.launch.clone(),
            restrict: self.restrict.clone(),
        }
    }

    /// The ids of the blobs this manifest is made of, each once, in order.
    pub fn blob_ids(&self) -> BTreeSet<&str> {
        self.artifacts
            .iter()
            .filter_map(Artifact::blob_id)
            .collect()
    }
}

impl Head {
    pub fn with_artifacts(self, artifacts: Vec<Artifact>) -> Manifest {
        Manifest {
            vars: self.vars,
            launch: self.launch,
            artifacts,
            restrict: self.restrict,
        }
    }
}

/// Only the format, read first: a later format may spell the rest of the head
/// in a way this reader would misreport as a parse error.
#[derive(Deserialize)]
struct FormatProbe {
    format: u64,
}

fn parse_head(bytes: &[u8]) -> Result<Head, BundleError> {
    let json = |source| BundleError::Json {
        entry: HEAD_ENTRY,
        source,
    };
    let probe: FormatProbe = serde_json::from_slice(bytes).map_err(json)?;
    if probe.format != u64::from(BUNDLE_FORMAT) {
        return Err(BundleError::Format {
            found: probe.format,
        });
    }
    serde_json::from_slice(bytes).map_err(json)
}

fn read_entry<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    name: &'static str,
) -> Result<Vec<u8>, BundleError> {
    let mut entry = match archive.by_name(name) {
        Ok(entry) => entry,
        Err(zip::result::ZipError::FileNotFound) => return Err(BundleError::MissingEntry(name)),
        Err(other) => return Err(other.into()),
    };
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry.read_to_end(&mut bytes)?;
    Ok(bytes)
}

/// Read a bundle's head and nothing else. Costs the zip's directory and a few
/// kilobytes, whatever the bundle weighs.
pub fn read_bundle_head<R: Read + Seek>(reader: R) -> Result<Head, BundleError> {
    let mut archive = ZipArchive::new(reader)?;
    parse_head(&read_entry(&mut archive, HEAD_ENTRY)?)
}

/// An open bundle: its manifest, decoded, and its blobs, still in the file.
pub struct Bundle<R> {
    manifest: Manifest,
    archive: ZipArchive<R>,
}

/// Open a bundle and decode its manifest. A manifest that names a blob the
/// bundle does not hold is refused here, not halfway through an install.
pub fn open_bundle<R: Read + Seek>(reader: R) -> Result<Bundle<R>, BundleError> {
    let mut archive = ZipArchive::new(reader)?;
    let head = parse_head(&read_entry(&mut archive, HEAD_ENTRY)?)?;
    let artifacts: Vec<Artifact> =
        serde_json::from_slice(&read_entry(&mut archive, ARTIFACTS_ENTRY)?).map_err(|source| {
            BundleError::Json {
                entry: ARTIFACTS_ENTRY,
                source,
            }
        })?;
    let manifest = head.with_artifacts(artifacts);
    for id in manifest.blob_ids() {
        if archive.index_for_name(&blob_entry(id)).is_none() {
            return Err(BundleError::MissingBlob(id.to_owned()));
        }
    }
    Ok(Bundle { manifest, archive })
}

impl<R: Read + Seek> Bundle<R> {
    pub fn manifest(&self) -> &Manifest {
        &self.manifest
    }

    pub fn into_manifest(self) -> Manifest {
        self.manifest
    }

    /// Write the blob `id` to `out`, returning how many bytes that was.
    pub fn copy_blob(&mut self, id: &str, out: &mut impl Write) -> Result<u64, BundleError> {
        let mut entry = match self.archive.by_name(&blob_entry(id)) {
            Ok(entry) => entry,
            Err(zip::result::ZipError::FileNotFound) => {
                return Err(BundleError::MissingBlob(id.to_owned()))
            }
            Err(other) => return Err(other.into()),
        };
        Ok(io::copy(&mut entry, out)?)
    }
}

/// Hashes what passes through it, so a blob is checked against its name by
/// the same read that writes it.
struct Hashing<W> {
    inner: W,
    hasher: Sha256,
}

impl<W: Write> Write for Hashing<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let written = self.inner.write(buf)?;
        self.hasher.update(&buf[..written]);
        Ok(written)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

/// Every entry is written with the same fixed timestamp and mode, and blobs go
/// in id order, so two builds of the same manifest are the same bytes.
fn entry_options(method: CompressionMethod, size: u64) -> SimpleFileOptions {
    SimpleFileOptions::default()
        .compression_method(method)
        .last_modified_time(DateTime::default())
        .unix_permissions(0o644)
        .large_file(size > u64::from(u32::MAX))
}

fn write_json<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    entry: &'static str,
    method: CompressionMethod,
    bytes: &[u8],
) -> Result<(), BundleError> {
    zip.start_file(entry, entry_options(method, bytes.len() as u64))?;
    zip.write_all(bytes)?;
    Ok(())
}

/// Write `manifest` and the blobs it names as a bundle.
///
/// Only blobs the manifest names are written — `blobs` may hold more, since an
/// artifact a later plugin replaced leaves its blob behind. Each is hashed as
/// it is copied and refused if it is not what its name says, which is the one
/// moment a blob table can be caught lying.
pub fn write_bundle<W: Write + Seek>(
    writer: W,
    manifest: &Manifest,
    blobs: &Blobs,
) -> Result<(), BundleError> {
    let json = |entry| move |source| BundleError::Json { entry, source };
    let mut zip = ZipWriter::new(writer);

    let head = serde_json::to_vec_pretty(&manifest.head()).map_err(json(HEAD_ENTRY))?;
    write_json(&mut zip, HEAD_ENTRY, CompressionMethod::Stored, &head)?;
    let artifacts = serde_json::to_vec(&manifest.artifacts).map_err(json(ARTIFACTS_ENTRY))?;
    write_json(
        &mut zip,
        ARTIFACTS_ENTRY,
        CompressionMethod::Deflated,
        &artifacts,
    )?;

    for id in manifest.blob_ids() {
        let source = blobs
            .get(id)
            .ok_or_else(|| BundleError::MissingBlob(id.to_owned()))?;
        let size = match source {
            BlobSource::Bytes(bytes) => bytes.len() as u64,
            BlobSource::File(path) => std::fs::metadata(path)
                .map_err(|source| BundleError::BlobFile {
                    id: id.to_owned(),
                    path: path.display().to_string(),
                    source,
                })?
                .len(),
        };
        zip.start_file(
            blob_entry(id),
            entry_options(CompressionMethod::Deflated, size),
        )?;
        let mut hashing = Hashing {
            inner: &mut zip,
            hasher: Sha256::new(),
        };
        match source {
            BlobSource::Bytes(bytes) => hashing.write_all(bytes)?,
            BlobSource::File(path) => {
                let mut file = File::open(path).map_err(|source| BundleError::BlobFile {
                    id: id.to_owned(),
                    path: path.display().to_string(),
                    source,
                })?;
                io::copy(&mut file, &mut hashing)?;
            }
        }
        let found = hex::encode(hashing.hasher.finalize());
        if found != id {
            return Err(BundleError::BlobMismatch {
                id: id.to_owned(),
                found,
            });
        }
    }

    zip.finish()?;
    Ok(())
}
