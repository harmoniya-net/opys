//! The `bundle` namespace: `opys-bundle`, as JS sees it.
//!
//! A manifest and a blob table cross as JSON and decode themselves, as they
//! do in every binding; a bundle is named by its path.

use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde_json::Value as Json;

fn map_err<E: std::fmt::Display>(e: E) -> napi::Error {
    napi::Error::from_reason(e.to_string())
}

fn from_js<T: serde::de::DeserializeOwned>(value: Json) -> Result<T> {
    serde_json::from_value(value).map_err(map_err)
}

fn to_js<T: serde::Serialize>(value: &T) -> Result<Json> {
    serde_json::to_value(value).map_err(map_err)
}

/// The id of the blob holding exactly `bytes`: the hex sha256 of them.
#[napi(namespace = "bundle", js_name = "blobId")]
pub fn blob_id(bytes: Buffer) -> String {
    opys_bundle::blob_id(&bytes)
}

#[napi(namespace = "bundle", object, js_name = "HashedBlob")]
pub struct HashedBlobJs {
    pub id: String,
    /// A file size, which fits a JS number long before it fits nowhere.
    pub size: i64,
}

/// Hashing a file is a read of all of it, so it runs off the main thread.
pub struct HashBlobFile(String);

impl Task for HashBlobFile {
    type Output = (String, u64);
    type JsValue = HashedBlobJs;

    fn compute(&mut self) -> Result<Self::Output> {
        let file = std::fs::File::open(&self.0)
            .map_err(|e| map_err(format!("cannot read {}: {e}", self.0)))?;
        opys_bundle::blob_id_of(file).map_err(map_err)
    }

    fn resolve(&mut self, _env: Env, (id, size): Self::Output) -> Result<Self::JsValue> {
        Ok(HashedBlobJs {
            id,
            size: size as i64,
        })
    }
}

/// The id and size of the blob a file on disk would be.
#[napi(namespace = "bundle", js_name = "hashBlobFile")]
pub fn hash_blob_file(path: String) -> AsyncTask<HashBlobFile> {
    AsyncTask::new(HashBlobFile(path))
}

pub struct WriteBundle {
    path: String,
    manifest: opys_core::Manifest,
    blobs: opys_bundle::Blobs,
}

impl Task for WriteBundle {
    type Output = ();
    type JsValue = ();

    fn compute(&mut self) -> Result<Self::Output> {
        // Written beside its destination and moved into place, so a build that
        // fails halfway leaves the previous bundle as it was.
        let partial = format!("{}.partial", self.path);
        let written = std::fs::File::create(&partial)
            .map_err(opys_bundle::BundleError::from)
            .and_then(|file| opys_bundle::write_bundle(file, &self.manifest, &self.blobs))
            .and_then(|()| Ok(std::fs::rename(&partial, &self.path)?));
        if written.is_err() {
            let _ = std::fs::remove_file(&partial);
        }
        written.map_err(map_err)
    }

    fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
        Ok(())
    }
}

/// Write `manifest` and the blobs it names to `path` as a bundle.
#[napi(namespace = "bundle", js_name = "writeBundle")]
pub fn write_bundle(path: String, manifest: Json, blobs: Json) -> Result<AsyncTask<WriteBundle>> {
    Ok(AsyncTask::new(WriteBundle {
        path,
        manifest: from_js(manifest)?,
        blobs: from_js(blobs)?,
    }))
}

fn open(path: &str) -> Result<std::fs::File> {
    std::fs::File::open(path).map_err(|e| map_err(format!("cannot read {path}: {e}")))
}

/// The manifest of the bundle at `path`.
#[napi(namespace = "bundle", js_name = "readBundle")]
pub fn read_bundle(path: String) -> Result<Json> {
    let bundle = opys_bundle::open_bundle(open(&path)?).map_err(map_err)?;
    to_js(bundle.manifest())
}

/// The head of the bundle at `path`: what it says about itself. The manifest
/// is left unread.
#[napi(namespace = "bundle", js_name = "readBundleHead")]
pub fn read_bundle_head(path: String) -> Result<Json> {
    to_js(&opys_bundle::read_bundle_head(open(&path)?).map_err(map_err)?)
}

/// The bundle format this build reads and writes.
#[napi(namespace = "bundle", js_name = "bundleFormat")]
pub fn bundle_format() -> u32 {
    opys_bundle::BUNDLE_FORMAT
}
