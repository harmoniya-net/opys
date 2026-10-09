//! The `modrinth` namespace: `opys-modrinth`, as JS sees it.
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

use std::collections::BTreeMap;

use napi::bindgen_prelude::*;
use napi_derive::napi;
use opys_modrinth::ModrinthFile;
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
    Files {
        references: Vec<String>,
        api_base: String,
    },
    Modpack {
        reference: String,
        api_base: String,
    },
}

impl Task for Fetch {
    type Output = Json;
    type JsValue = Unknown;

    fn compute(&mut self) -> Result<Json> {
        match self {
            Fetch::Files {
                references,
                api_base,
            } => to_json(
                &opys_modrinth::resolve_modrinth_files(references, api_base).map_err(map_err)?,
            ),
            Fetch::Modpack {
                reference,
                api_base,
            } => to_json(
                &opys_modrinth::resolve_modrinth_modpack(reference, api_base).map_err(map_err)?,
            ),
        }
    }

    /// `serde_json::Value` has no `TypeName`, so the conversion to JS happens
    /// here, on the main thread, where an `Env` is in hand.
    fn resolve(&mut self, env: Env, output: Json) -> Result<Unknown> {
        env.to_js_value(&output)
    }
}

/// Resolve version references to one file each, in the order given —
/// `{ filename, versionId, projectId, versionNumber, size, url, sha1? }[]`.
#[napi(
    namespace = "modrinth",
    js_name = "resolveModrinthFiles",
    ts_return_type = "Promise<Json>"
)]
pub fn resolve_modrinth_files(references: Vec<String>, api_base: String) -> AsyncTask<Fetch> {
    AsyncTask::new(Fetch::Files {
        references,
        api_base,
    })
}

/// Resolve a modpack to `{ index, dependencies, loader, files, overrides }` —
/// everything but the loader itself.
#[napi(
    namespace = "modrinth",
    js_name = "resolveModrinthModpack",
    ts_return_type = "Promise<Json>"
)]
pub fn resolve_modrinth_modpack(reference: String, api_base: String) -> AsyncTask<Fetch> {
    AsyncTask::new(Fetch::Modpack {
        reference,
        api_base,
    })
}

// ──────────────────────────────────────────────────────────────────────────
// Pure
// ──────────────────────────────────────────────────────────────────────────

/// Turn resolved files into artifacts, each at the path chosen for it. The
/// paths come from the config author's callback, which only the host can run.
#[napi(namespace = "modrinth", js_name = "modrinthFileArtifacts")]
pub fn modrinth_file_artifacts(files: Json, paths: Vec<String>) -> Result<Json> {
    let files: Vec<ModrinthFile> = from_json(files)?;
    to_json(&opys_modrinth::file_artifacts(&files, &paths).map_err(map_err)?)
}

/// Map a `.mrpack`'s `dependencies` to the loader it runs on.
#[napi(namespace = "modrinth", js_name = "loaderSpec")]
pub fn loader_spec(dependencies: Json) -> Result<Json> {
    let dependencies: BTreeMap<String, String> = from_json(dependencies)?;
    to_json(&opys_modrinth::loader_spec(&dependencies).map_err(map_err)?)
}

/// Modrinth's public API base.
#[napi(namespace = "modrinth", js_name = "defaultModrinthApi")]
pub fn default_modrinth_api() -> &'static str {
    opys_modrinth::MODRINTH_API
}
