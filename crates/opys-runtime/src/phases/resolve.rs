use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use futures::StreamExt;
use opys_core::{open_bundle, read_bundle_head, Blobs, BundleError, Head, Manifest};
use serde::Deserialize;

use crate::blobs::BlobStore;
use crate::errors::InstallError;
use crate::fetch::{fetch_with_retry, RetryOptions};

/// Where the manifest to install comes from.
///
/// It decodes itself, discriminated by which field is present like every
/// shape in the format: `{ manifest, blobs? }`, `{ bundle }` or `{ url }`.
#[derive(Debug, Clone, Deserialize)]
#[serde(try_from = "ManifestSourceWire")]
pub enum ManifestSource {
    /// A manifest already in memory, and where each blob it names is kept —
    /// what a build hands over when nothing was written out in between.
    Manifest {
        manifest: Box<Manifest>,
        blobs: Blobs,
    },
    /// Local filesystem path to a bundle.
    Bundle(PathBuf),
    /// HTTP(S) URL to a bundle. It is downloaded whole before anything is
    /// installed from it.
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
    blobs: Option<Blobs>,
    #[serde(default)]
    bundle: Option<PathBuf>,
    #[serde(default)]
    url: Option<String>,
}

impl TryFrom<ManifestSourceWire> for ManifestSource {
    type Error = &'static str;

    fn try_from(raw: ManifestSourceWire) -> Result<Self, Self::Error> {
        match (raw.manifest, raw.blobs, raw.bundle, raw.url) {
            (Some(manifest), blobs, None, None) => Ok(ManifestSource::Manifest {
                manifest,
                blobs: blobs.unwrap_or_default(),
            }),
            (None, None, Some(bundle), None) => Ok(ManifestSource::Bundle(bundle)),
            (None, None, None, Some(url)) => Ok(ManifestSource::Url(url)),
            _ => Err("a manifest source is `{ manifest, blobs? }`, `{ bundle }` or `{ url }`"),
        }
    }
}

impl ManifestSource {
    /// A manifest in memory that names no blobs.
    pub fn manifest(manifest: Manifest) -> Self {
        ManifestSource::Manifest {
            manifest: Box::new(manifest),
            blobs: Blobs::new(),
        }
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

async fn download(url: &str) -> Result<tempfile::TempPath, InstallError> {
    let network = |status: u16, body: String| InstallError::Network {
        url: url.to_owned(),
        status,
        body,
    };
    let res = fetch_with_retry(reqwest::Method::GET, url, RetryOptions::default())
        .await
        .map_err(|e| network(0, e.to_string()))?;
    let status = res.status();
    if !status.is_success() {
        return Err(network(
            status.as_u16(),
            res.text().await.unwrap_or_default(),
        ));
    }
    let mut file = tempfile::NamedTempFile::new().map_err(|source| InstallError::Io {
        path: std::env::temp_dir().display().to_string(),
        source,
    })?;
    let mut stream = res.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| network(0, e.to_string()))?;
        file.write_all(&chunk).map_err(|source| InstallError::Io {
            path: file.path().display().to_string(),
            source,
        })?;
    }
    Ok(file.into_temp_path())
}

pub(crate) async fn resolve(source: ManifestSource) -> Result<Resolved, InstallError> {
    match source {
        ManifestSource::Manifest { manifest, blobs } => {
            // The same promise an opened bundle makes: a blob the manifest
            // names and nothing holds is found here, not halfway through.
            for id in manifest.blob_ids() {
                if !blobs.contains_key(id) {
                    return Err(BundleError::MissingBlob(id.to_owned()).into());
                }
            }
            Ok(Resolved {
                manifest: *manifest,
                blobs: BlobStore::Table(blobs),
            })
        }
        ManifestSource::Bundle(path) => resolve_bundle(&path, None),
        ManifestSource::Url(url) => {
            let downloaded = download(&url).await?;
            let path = downloaded.to_path_buf();
            resolve_bundle(&path, Some(downloaded))
        }
    }
}

/// The manifest alone, for a caller that installs nothing.
pub async fn resolve_manifest(source: ManifestSource) -> Result<Manifest, InstallError> {
    Ok(resolve(source).await?.manifest)
}

/// A manifest's head. For a bundle on disk this reads the head entry and
/// leaves the artifact list where it is.
pub(crate) async fn resolve_head(source: ManifestSource) -> Result<Head, InstallError> {
    match source {
        ManifestSource::Bundle(path) => Ok(read_bundle_head(open_at(&path)?)?),
        other => Ok(resolve(other).await?.manifest.head()),
    }
}
