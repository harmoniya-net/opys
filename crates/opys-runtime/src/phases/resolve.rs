use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use opys_bundle::{open_bundle, BundleError};
use opys_core::Manifest;
use serde::Deserialize;

use crate::blobs::BlobStore;
use crate::errors::InstallError;
use crate::remote::{self, Opened};

/// Where the manifest to install comes from.
///
/// It decodes itself, discriminated by which field is present like every
/// shape in the format: `{ manifest }`, `{ bundle }` or `{ url }`.
#[derive(Debug, Clone, Deserialize)]
#[serde(try_from = "ManifestSourceWire")]
pub enum ManifestSource {
    /// A manifest already in memory. It can name no blob: a blob is an
    /// entry of a bundle, and there is none here to hold it.
    Manifest(Box<Manifest>),
    /// Local filesystem path to a bundle.
    Bundle(PathBuf),
    /// HTTP(S) URL to a bundle. It is read in pieces: its directory and
    /// manifest, then each blob the install is missing.
    Url(String),
}

/// A struct of options rather than an untagged enum, so that a source of the
/// wrong shape is told what the right ones are instead of "did not match any
/// variant".
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ManifestSourceWire {
    #[serde(default)]
    manifest: Option<Box<Manifest>>,
    #[serde(default)]
    bundle: Option<PathBuf>,
    #[serde(default)]
    url: Option<String>,
}

impl TryFrom<ManifestSourceWire> for ManifestSource {
    type Error = &'static str;

    fn try_from(raw: ManifestSourceWire) -> Result<Self, Self::Error> {
        match (raw.manifest, raw.bundle, raw.url) {
            (Some(manifest), None, None) => Ok(ManifestSource::Manifest(manifest)),
            (None, Some(bundle), None) => Ok(ManifestSource::Bundle(bundle)),
            (None, None, Some(url)) => Ok(ManifestSource::Url(url)),
            _ => Err("a manifest source is `{ manifest }`, `{ bundle }` or `{ url }`"),
        }
    }
}

impl ManifestSource {
    /// A manifest in memory.
    pub fn manifest(manifest: Manifest) -> Self {
        ManifestSource::Manifest(Box::new(manifest))
    }

    pub fn bundle(path: impl Into<PathBuf>) -> Self {
        ManifestSource::Bundle(path.into())
    }

    pub fn url(url: impl Into<String>) -> Self {
        ManifestSource::Url(url.into())
    }
}

/// A manifest and the blobs it names, ready to install from.
pub(crate) struct Resolved {
    pub manifest: Manifest,
    pub blobs: BlobStore,
}

fn open_at(path: &Path) -> Result<File, InstallError> {
    File::open(path).map_err(|source| InstallError::Io {
        path: path.display().to_string(),
        source,
    })
}

fn resolve_bundle(
    path: &Path,
    downloaded: Option<tempfile::TempPath>,
) -> Result<Resolved, InstallError> {
    let bundle = open_bundle(open_at(path)?)?;
    Ok(Resolved {
        manifest: bundle.manifest().clone(),
        blobs: BlobStore::Bundle {
            bundle: Box::new(Mutex::new(bundle)),
            _downloaded: downloaded,
        },
    })
}

pub(crate) async fn resolve(source: ManifestSource) -> Result<Resolved, InstallError> {
    match source {
        ManifestSource::Manifest(manifest) => {
            // The same promise an opened bundle makes: a blob the manifest
            // names and nothing holds is found here, not halfway through.
            if let Some(id) = manifest.blob_ids().into_iter().next() {
                return Err(BundleError::MissingBlob(id.to_owned()).into());
            }
            Ok(Resolved {
                manifest: *manifest,
                blobs: BlobStore::None,
            })
        }
        ManifestSource::Bundle(path) => resolve_bundle(&path, None),
        ManifestSource::Url(url) => match remote::open(&url).await? {
            Opened::Remote(remote, manifest) => Ok(Resolved {
                manifest: *manifest,
                blobs: BlobStore::Remote(remote),
            }),
            Opened::Whole(downloaded) => {
                let path = downloaded.to_path_buf();
                resolve_bundle(&path, Some(downloaded))
            }
        },
    }
}

/// The manifest alone, for a caller that installs nothing.
pub async fn resolve_manifest(source: ManifestSource) -> Result<Manifest, InstallError> {
    Ok(resolve(source).await?.manifest)
}
