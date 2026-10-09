//! Where the blobs of the manifest being installed are.
//!
//! A blob is an entry of a bundle, so there is one answer: inside the bundle
//! the manifest was read from. A manifest handed over in memory has no
//! bundle and names no blob.

use std::fs::File;
use std::path::Path;
use std::sync::Mutex;

use opys_bundle::{Bundle, BundleError};

use crate::errors::InstallError;

pub(crate) enum BlobStore {
    /// A manifest in memory: resolving it has already refused any blob.
    None,
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
            BlobStore::None => return Err(BundleError::MissingBlob(id.to_owned()).into()),
            BlobStore::Bundle { bundle, .. } => bundle
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .copy_blob(id, &mut out)?,
        };
        Ok(written)
    }
}
