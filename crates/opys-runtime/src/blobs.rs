//! Where the blobs of the manifest being installed are.
//!
//! A manifest says which bytes a blob artifact is made of and never where
//! they are kept, so the installer is handed that separately. There are two
//! answers: inside the bundle the manifest was read from, or — when the
//! manifest was built a moment ago on this machine and never written out — a
//! table of files and buffers.

use std::fs::File;
use std::io::{self, Write};
use std::path::Path;
use std::sync::Mutex;

use opys_core::{BlobSource, Blobs, Bundle, BundleError};

use crate::errors::InstallError;

pub(crate) enum BlobStore {
    Table(Blobs),
    Bundle {
        // One reader, so one copy at a time. A blob is a local read, and the
        // zip's directory is parsed once rather than once per blob.
        bundle: Box<Mutex<Bundle<File>>>,
        /// A bundle that was downloaded to be installed: deleted with the
        /// store, which outlives every copy made from it.
        _downloaded: Option<tempfile::TempPath>,
    },
}

impl BlobStore {
    /// Write the blob `id` to `dest`, returning its length.
    pub(crate) fn copy_to(&self, id: &str, dest: &Path) -> Result<u64, InstallError> {
        let io_at = |path: &Path| {
            let path = path.display().to_string();
            move |source| InstallError::Io { path, source }
        };
        let mut out = File::create(dest).map_err(io_at(dest))?;
        let written = match self {
            BlobStore::Table(blobs) => match blobs.get(id) {
                None => return Err(BundleError::MissingBlob(id.to_owned()).into()),
                Some(BlobSource::Bytes(bytes)) => {
                    out.write_all(bytes).map_err(io_at(dest))?;
                    bytes.len() as u64
                }
                // Read and written rather than `fs::copy`d: the installed file
                // should not inherit the mode of wherever it was built from.
                Some(BlobSource::File(path)) => {
                    let mut file = File::open(path).map_err(io_at(path))?;
                    io::copy(&mut file, &mut out).map_err(io_at(dest))?
                }
            },
            BlobStore::Bundle { bundle, .. } => bundle
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .copy_blob(id, &mut out)?,
        };
        Ok(written)
    }
}
