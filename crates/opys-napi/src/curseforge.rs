//! The `curseforge` namespace: `opys-curseforge`, as JS sees it.
//!
//! One addon per crate, matching the rest of the family: a binding is
//! packaging, and a package that names its own module is what keeps the crate
//! split legible. Collapsing addons is a separate decision, taken for all of
//! them at once rather than crate by crate.
//!
//! JSON crosses the boundary as `serde_json::Value`; every domain type decodes
//! and encodes itself, so nothing is mirrored here.
//!
//! Anything that touches the network is an `AsyncTask`: these calls block, and
//! `opys build` runs its plugins concurrently, so running them on the libuv
//! pool is what keeps that concurrency real.

use napi::bindgen_prelude::*;
use napi_derive::napi;
use opys_curseforge::{CurseForgeFile, FileRef, ModpackManifest};
use serde_json::Value as Json;

fn map_err<E: std::fmt::Display>(e: E) -> napi::Error {
    napi::Error::from_reason(e.to_string())
}

fn to_json<T: serde::Serialize>(value: &T) -> Result<Json> {
    serde_json::to_value(value).map_err(map_err)
}

fn from_json<T: serde::de::DeserializeOwned>(raw: Json) -> Result<T> {
    serde_json::from_value(raw).map_err(map_err)
}

// ──────────────────────────────────────────────────────────────────────────
// Network — one variant per entry point, each with its own typed input.
// ──────────────────────────────────────────────────────────────────────────

pub enum Fetch {
    /// By reference, in the caller's order.
    Files {
        token: String,
        references: Vec<FileRef>,
        api_base: String,
    },
    /// By id, in the API's order.
    Lookup {
        token: String,
        file_ids: Vec<u64>,
        api_base: String,
    },
    Modpack {
        token: String,
        reference: FileRef,
        api_base: String,
    },
}

impl Task for Fetch {
    type Output = Json;
    type JsValue = Unknown;

    fn compute(&mut self) -> Result<Json> {
        match self {
            Fetch::Files {
                token,
                references,
                api_base,
            } => to_json(
                &opys_curseforge::resolve_curseforge_files(token, references, api_base)
                    .map_err(map_err)?,
            ),
            Fetch::Lookup {
                token,
                file_ids,
                api_base,
            } => to_json(
                &opys_curseforge::fetch_curseforge_files(token, file_ids, api_base)
                    .map_err(map_err)?,
            ),
            Fetch::Modpack {
                token,
                reference,
                api_base,
            } => to_json(
                &opys_curseforge::resolve_curseforge_modpack(token, reference, api_base)
                    .map_err(map_err)?,
            ),
        }
    }

    /// `serde_json::Value` has no `TypeName`, so the conversion to JS happens
    /// here, on the main thread, where an `Env` is in hand.
    fn resolve(&mut self, env: Env, output: Json) -> Result<Unknown> {
        env.to_js_value(&output)
    }
}

/// Resolve file references — ids or `/files/<id>` URLs — to one file each, in
/// the order given: `{ fileId, projectId, filename, size, url, sha1? }[]`.
#[napi(
    namespace = "curseforge",
    js_name = "resolveCurseforgeFiles",
    ts_return_type = "Promise<Json>"
)]
pub fn resolve_curseforge_files(
    token: String,
    references: Json,
    api_base: String,
) -> Result<AsyncTask<Fetch>> {
    Ok(AsyncTask::new(Fetch::Files {
        token,
        references: from_json(references)?,
        api_base,
    }))
}

/// Look files up by id. The result is in the API's order and omits any id it
/// does not know.
#[napi(
    namespace = "curseforge",
    js_name = "fetchCurseforgeFiles",
    ts_return_type = "Promise<Json>"
)]
pub fn fetch_curseforge_files(
    token: String,
    file_ids: Json,
    api_base: String,
) -> Result<AsyncTask<Fetch>> {
    Ok(AsyncTask::new(Fetch::Lookup {
        token,
        file_ids: from_json(file_ids)?,
        api_base,
    }))
}

/// Resolve a modpack to `{ manifest, loader, files, overrides }` — everything
/// but the loader itself.
#[napi(
    namespace = "curseforge",
    js_name = "resolveCurseforgeModpack",
    ts_return_type = "Promise<Json>"
)]
pub fn resolve_curseforge_modpack(
    token: String,
    reference: Json,
    api_base: String,
) -> Result<AsyncTask<Fetch>> {
    Ok(AsyncTask::new(Fetch::Modpack {
        token,
        reference: from_json(reference)?,
        api_base,
    }))
}

// ──────────────────────────────────────────────────────────────────────────
// Pure
// ──────────────────────────────────────────────────────────────────────────

/// Turn resolved files into artifacts, each at the path chosen for it. The
/// paths come from the config author's callback, which only the host can run.
#[napi(namespace = "curseforge", js_name = "curseforgeFileArtifacts")]
pub fn curseforge_file_artifacts(files: Json, paths: Vec<String>) -> Result<Json> {
    let files: Vec<CurseForgeFile> = from_json(files)?;
    to_json(&opys_curseforge::file_artifacts(&files, &paths).map_err(map_err)?)
}

/// Map a modpack `manifest.json` to the loader it runs on.
#[napi(namespace = "curseforge", js_name = "loaderSpecFromManifest")]
pub fn loader_spec_from_manifest(manifest: Json) -> Result<Json> {
    let manifest: ModpackManifest = from_json(manifest)?;
    to_json(&opys_curseforge::loader_spec(&manifest).map_err(map_err)?)
}

/// The id a file reference names — the number, or the one in its URL.
#[napi(namespace = "curseforge", js_name = "parseFileRef")]
pub fn parse_file_ref(reference: Json) -> Result<f64> {
    let reference: FileRef = from_json(reference)?;
    Ok(reference.id().map_err(map_err)? as f64)
}

/// CurseForge's public API base.
#[napi(namespace = "curseforge", js_name = "defaultCurseforgeApi")]
pub fn default_curseforge_api() -> &'static str {
    opys_curseforge::CURSEFORGE_API
}
