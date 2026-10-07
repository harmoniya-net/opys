//! napi-rs bindings for `opys-core`.
//!
//! Strategy: JSON crosses the boundary as `serde_json::Value` (napi-rs maps
//! it to native JS values). Behaviors live in Rust; the TS package's
//! `@opys/core` index is a thin re-export of these bindings + .d.ts.

#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde_json::Value as Json;
use std::collections::HashMap;

fn map_err<E: std::fmt::Display>(e: E) -> napi::Error {
    napi::Error::from_reason(e.to_string())
}

/// Decode a JS value into a domain type. The domain types own their wire
/// conversion, so this is the single shape the boundary needs.
fn from_js<T: serde::de::DeserializeOwned>(value: Json) -> Result<T> {
    serde_json::from_value(value).map_err(map_err)
}

fn to_js<T: serde::Serialize>(value: &T) -> Result<Json> {
    serde_json::to_value(value).map_err(map_err)
}

/// Decode a wire manifest (plain JS object) into the domain shape.
/// Returns the domain object as plain JS.
#[napi(js_name = "decodeManifest")]
pub fn decode_manifest(wire: Json) -> Result<Json> {
    to_js(&from_js::<opys_core::Manifest>(wire)?)
}

/// Encode a domain manifest back to its wire form.
#[napi(js_name = "encodeManifest")]
pub fn encode_manifest(domain: Json) -> Result<Json> {
    // The domain object is just the wire shape (we don't keep separate runtime
    // types on the TS side), so this is the same round-trip as `decodeManifest`
    // — kept as its own export because the TS API names both directions.
    to_js(&from_js::<opys_core::Manifest>(domain)?)
}

/// Parse a JSON-string manifest and return the domain shape as JS.
#[napi(js_name = "parseManifest")]
pub fn parse_manifest(input: String) -> Result<Json> {
    to_js(&opys_core::parse_manifest(&input).map_err(map_err)?)
}

#[napi(object, js_name = "OsOptions")]
pub struct OsOptionsJs {
    pub name: String,
    pub version: String,
    pub arch: String,
}

impl From<OsOptionsJs> for opys_core::OsOptions {
    fn from(o: OsOptionsJs) -> Self {
        opys_core::OsOptions {
            name: o.name,
            version: o.version,
            arch: o.arch,
        }
    }
}

/// Resolve `${var}` references in a flat var map. Throws on circular refs.
#[napi(js_name = "resolveVars")]
pub fn resolve_vars(vars: HashMap<String, String>) -> Result<HashMap<String, String>> {
    let m: indexmap::IndexMap<String, String> = vars.into_iter().collect();
    let resolved = opys_core::resolve_vars(&m).map_err(napi::Error::from_reason)?;
    Ok(resolved.into_iter().collect())
}

/// Substitute resolved vars into a template string.
#[napi(js_name = "interpolate")]
pub fn interpolate(template: String, vars: HashMap<String, String>) -> String {
    let m: indexmap::IndexMap<String, String> = vars.into_iter().collect();
    opys_core::interpolate(&template, &m)
}

/// Drop artifacts whose rules exclude the given platform / features.
#[napi(js_name = "filterManifest")]
pub fn filter_manifest(
    manifest: Json,
    platform: OsOptionsJs,
    features: Vec<String>,
) -> Result<Json> {
    let m: opys_core::Manifest = from_js(manifest)?;
    let filtered = opys_core::filter_manifest(&m, &platform.into(), &features).map_err(map_err)?;
    to_js(&filtered)
}

/// Resolve a Launch's `args` rule-tagged values for the given platform.
#[napi(js_name = "resolvedArgs")]
pub fn resolved_args(
    launch: Json,
    platform: OsOptionsJs,
    features: Vec<String>,
) -> Result<Vec<String>> {
    let l: opys_core::Launch = from_js(launch)?;
    opys_core::resolved_args(&l, &platform.into(), &features).map_err(map_err)
}

/// Resolve a Launch's `envs` rule-tagged values for the given platform.
#[napi(js_name = "resolvedEnvs")]
pub fn resolved_envs(
    launch: Json,
    platform: OsOptionsJs,
    features: Vec<String>,
) -> Result<HashMap<String, String>> {
    let l: opys_core::Launch = from_js(launch)?;
    let env = opys_core::resolved_envs(&l, &platform.into(), &features).map_err(map_err)?;
    Ok(env.into_iter().collect())
}

/// Evaluate a ruleset against a platform + active features.
#[napi(js_name = "satisfiesRuleset")]
pub fn satisfies_ruleset(
    rules: Json,
    platform: OsOptionsJs,
    features: Vec<String>,
) -> Result<bool> {
    let raw: opys_core::Ruleset = serde_json::from_value(rules).map_err(map_err)?;
    let parsed = opys_core::parse_short_ruleset(raw).map_err(map_err)?;
    opys_mojang_rules::satisfies_ruleset(&parsed, &platform.into(), &features).map_err(map_err)
}

/// Compile a glob to its regex source.
#[napi(js_name = "globToRegexSource")]
pub fn glob_to_regex_source(glob: String) -> String {
    opys_core::glob_to_regex(&glob).as_str().to_owned()
}

/// The non-wildcard prefix of a glob, used as a sweep starting point.
#[napi(js_name = "globBase")]
pub fn glob_base(glob: String) -> String {
    opys_core::glob_base(&glob)
}

/// Single discriminated error shape (Q10 in design doc).
#[napi(object, js_name = "OpysErrorInfo")]
pub struct OpysErrorInfo {
    pub code: String,
    pub message: String,
}

// ── blobs and the bundle ────────────────────────────────────────────────────

/// The id of the blob holding exactly `bytes`: the hex sha256 of them.
#[napi(js_name = "blobId")]
pub fn blob_id(bytes: Buffer) -> String {
    opys_core::blob_id(&bytes)
}

#[napi(object, js_name = "HashedBlob")]
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
        opys_core::blob_id_of(file).map_err(map_err)
    }

    fn resolve(&mut self, _env: Env, (id, size): Self::Output) -> Result<Self::JsValue> {
        Ok(HashedBlobJs {
            id,
            size: size as i64,
        })
    }
}

/// The id and size of the blob a file on disk would be.
#[napi(js_name = "hashBlobFile")]
pub fn hash_blob_file(path: String) -> AsyncTask<HashBlobFile> {
    AsyncTask::new(HashBlobFile(path))
}

pub struct WriteBundle {
    path: String,
    manifest: opys_core::Manifest,
    blobs: opys_core::Blobs,
}

impl Task for WriteBundle {
    type Output = ();
    type JsValue = ();

    fn compute(&mut self) -> Result<Self::Output> {
        // Written beside its destination and moved into place, so a build that
        // fails halfway leaves the previous bundle as it was.
        let partial = format!("{}.partial", self.path);
        let written = std::fs::File::create(&partial)
            .map_err(opys_core::BundleError::from)
            .and_then(|file| opys_core::write_bundle(file, &self.manifest, &self.blobs))
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
#[napi(js_name = "writeBundle")]
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

/// The whole manifest of the bundle at `path`.
#[napi(js_name = "readBundle")]
pub fn read_bundle(path: String) -> Result<Json> {
    let bundle = opys_core::open_bundle(open(&path)?).map_err(map_err)?;
    to_js(bundle.manifest())
}

/// The head of the bundle at `path` — everything but its artifact list,
/// which is left unread.
#[napi(js_name = "readBundleHead")]
pub fn read_bundle_head(path: String) -> Result<Json> {
    to_js(&opys_core::read_bundle_head(open(&path)?).map_err(map_err)?)
}

/// The bundle format this build reads and writes.
#[napi(js_name = "bundleFormat")]
pub fn bundle_format() -> u32 {
    opys_core::BUNDLE_FORMAT
}
