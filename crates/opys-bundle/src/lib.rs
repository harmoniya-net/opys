//! The bundle: a manifest and the blobs it names, as one file.
//!
//! It is a zip, and deliberately nothing more — `unzip -l` reads it:
//!
//! ```text
//! opys.json        the head: which format this bundle is written in
//! manifest.json    the manifest, whole
//! blobs/<sha256>   one entry per blob
//! ```
//!
//! The head is about the bundle and the manifest is about the installation,
//! and the two are kept apart for that reason. The head is the first entry
//! and is stored uncompressed, so what a bundle is can be read with one seek,
//! or off the front of the file by something that never parses a zip at all.
//! It says only `format` today; whatever else is worth knowing about a bundle
//! without decoding megabytes of manifest goes there.
//!
//! `manifest.json` is a [`Manifest`] as `opys-core` reads and writes it, and
//! nothing else: the container adds no spelling of its own.

use std::fs::File;
use std::io::{self, Read, Seek, Write};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, DateTime, ZipArchive, ZipWriter};

use opys_core::Manifest;

mod blob;

pub use blob::{blob_id, blob_id_of, BlobSource, Blobs};

/// The format this reader and writer speak. A bundle that says anything else
/// is refused before another byte of it is interpreted.
pub const BUNDLE_FORMAT: u32 = 1;

const HEAD_ENTRY: &str = "opys.json";
const MANIFEST_ENTRY: &str = "manifest.json";

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

/// What a bundle says about itself, apart from the installation it carries.
///
/// A head that has been read is in [`BUNDLE_FORMAT`], since any other is
/// refused; the field is kept because a head is also what gets written.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Head {
    pub format: u32,
}

impl Default for Head {
    fn default() -> Self {
        Head {
            format: BUNDLE_FORMAT,
        }
    }
}

/// Only the format, read first and as widely as a number goes: another
/// format may spell the rest of the head in a way this reader would misreport
/// as a parse error.
///
/// A reader reads one format. Any other number is refused, an older one as
/// much as a newer: there is no migration and no lenient reading, because a
/// half-understood manifest is one that installs or deletes the wrong files.
/// Whoever holds an old bundle rebuilds it.
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

fn parse_manifest(bytes: &[u8]) -> Result<Manifest, BundleError> {
    serde_json::from_slice(bytes).map_err(|source| BundleError::Json {
        entry: MANIFEST_ENTRY,
        source,
    })
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
/// bytes, whatever the bundle weighs.
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
    // The head first: a bundle in another format is refused before its
    // manifest is looked at.
    parse_head(&read_entry(&mut archive, HEAD_ENTRY)?)?;
    let manifest = parse_manifest(&read_entry(&mut archive, MANIFEST_ENTRY)?)?;
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

    let head = serde_json::to_vec_pretty(&Head::default()).map_err(json(HEAD_ENTRY))?;
    write_json(&mut zip, HEAD_ENTRY, CompressionMethod::Stored, &head)?;
    let body = serde_json::to_vec(manifest).map_err(json(MANIFEST_ENTRY))?;
    write_json(&mut zip, MANIFEST_ENTRY, CompressionMethod::Deflated, &body)?;

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
