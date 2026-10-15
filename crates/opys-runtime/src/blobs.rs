//! Where the blobs of the manifest being installed are.
//!
//! A blob is an entry of a bundle, so there is one answer: inside the bundle
//! the manifest was read from — a file on this machine, or one behind a URL
//! that is asked for one blob at a time. A manifest handed over in memory
//! has no bundle and names no blob.

use std::fs::File;
use std::path::Path;
use std::sync::{Arc, Mutex};

use opys_bundle::{Bundle, BundleError};

use crate::errors::InstallError;
use crate::remote::Remote;

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
    /// A bundle behind a URL: each blob is its own request.
    Remote(Remote),
}

impl BlobStore {
    /// Whether a blob is read from this machine, where trying again does not
    /// help.
    pub(crate) fn is_local(&self) -> bool {
        !matches!(self, BlobStore::Remote(_))
    }

    /// Write the blob `id` to `dest`, reporting how much of it has been
    /// written, and return its length.
    pub(crate) async fn copy_to(
        self: &Arc<Self>,
        id: &str,
        dest: &Path,
        on_bytes: &(dyn Fn(u64) + Send + Sync),
    ) -> Result<u64, InstallError> {
        let written = match &**self {
            BlobStore::None => return Err(BundleError::MissingBlob(id.to_owned()).into()),
            BlobStore::Remote(remote) => return remote.copy_to(id, dest, on_bytes).await,
            // A local read, off the async threads.
            BlobStore::Bundle { .. } => {
                let (store, id, dest) = (Arc::clone(self), id.to_owned(), dest.to_owned());
                tokio::task::spawn_blocking(move || store.copy_local(&id, &dest))
                    .await
                    .map_err(|e| InstallError::other(format!("join error: {e}")))??
            }
        };
        on_bytes(written);
        Ok(written)
    }

    fn copy_local(&self, id: &str, dest: &Path) -> Result<u64, InstallError> {
        let BlobStore::Bundle { bundle, .. } = self else {
            unreachable!("called for a bundle on disk only")
        };
        let mut out = File::create(dest).map_err(|source| InstallError::Io {
            path: dest.display().to_string(),
            source,
        })?;
        Ok(bundle
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .copy_blob(id, &mut out)?)
    }
}
