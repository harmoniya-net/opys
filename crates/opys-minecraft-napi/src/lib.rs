//! napi-rs bindings for the Minecraft loader family.
//!
//! One addon for every loader, not one per loader: each gets its own crate
//! (`opys-minecraft-vanilla` today, `opys-forge` and the rest to follow), and
//! they are linked in here together, so the release matrix stays at a single
//! `.node` across seven target triples.
//!
//! JSON crosses the boundary as `serde_json::Value`; every domain type decodes
//! and encodes itself, so nothing is mirrored here. That the loaders hand a
//! `Client` straight back in — `fetchClient` out, `clientToTemplate` in — is
//! why `opys-mojang`'s domain types are symmetric rather than parsing the
//! version-JSON spelling through `Deserialize`.
//!
//! Anything that touches the network is an `AsyncTask`: these calls block, and
//! `opys build` runs its plugins concurrently, so running them on the libuv
//! pool is what keeps that concurrency real. The mappers are pure and stay
//! synchronous.

#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use opys_minecraft_vanilla::{ClasspathEntry, MinecraftOptions};
use opys_mojang::{AssetIndex, AssetManifest, Client, Library, MojangArgValue};
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

fn options<T: serde::de::DeserializeOwned + Default>(raw: Option<Json>) -> Result<T> {
    match raw {
        None | Some(Json::Null) => Ok(T::default()),
        Some(raw) => from_json(raw),
    }
}

// ──────────────────────────────────────────────────────────────────────────
// Network — one variant per entry point, each with its own typed input.
// ──────────────────────────────────────────────────────────────────────────

pub enum Fetch {
    Resolve(MinecraftOptions),
    Build(MinecraftOptions),
    Client(MinecraftOptions),
    Template(Box<Client>),
    VersionManifest(Option<String>),
    AssetManifest(String),
}

impl Task for Fetch {
    type Output = Json;
    type JsValue = Unknown;

    fn compute(&mut self) -> Result<Json> {
        match self {
            Fetch::Resolve(options) => {
                to_json(&opys_minecraft_vanilla::resolve_minecraft(options).map_err(map_err)?)
            }
            Fetch::Build(options) => {
                to_json(&opys_minecraft_vanilla::build_minecraft(options).map_err(map_err)?)
            }
            Fetch::Client(options) => {
                let (version, client) = opys_minecraft_vanilla::fetch_client(
                    options.version.as_deref(),
                    options.manifest_base.as_deref(),
                )
                .map_err(map_err)?;
                Ok(serde_json::json!({
                    "version": to_json(&version)?,
                    "client": to_json(&client)?,
                }))
            }
            Fetch::Template(client) => {
                to_json(&opys_minecraft_vanilla::resolve_client_template(client).map_err(map_err)?)
            }
            Fetch::VersionManifest(base) => to_json(
                &opys_minecraft_vanilla::fetch_version_manifest(base.as_deref())
                    .map_err(map_err)?,
            ),
            Fetch::AssetManifest(url) => {
                to_json(&opys_minecraft_vanilla::fetch_asset_manifest(url).map_err(map_err)?)
            }
        }
    }

    /// `serde_json::Value` has no `TypeName`, so the conversion to JS happens
    /// here, on the main thread, where an `Env` is in hand.
    fn resolve(&mut self, env: Env, output: Json) -> Result<Unknown> {
        env.to_js_value(&output)
    }
}

/// Resolve vanilla Minecraft into `{ artifacts, vars, classpath, launch,
/// jvmArgs, mainClass, gameArgs }`.
#[napi(js_name = "resolveMinecraft", ts_return_type = "Promise<Json>")]
pub fn resolve_minecraft(opts: Option<Json>) -> Result<AsyncTask<Fetch>> {
    Ok(AsyncTask::new(Fetch::Resolve(options(opts)?)))
}

/// Run the `minecraft` plugin: the same resolve, returned as the contribution
/// to merge — `{ name, contribution }`.
#[napi(js_name = "buildMinecraft", ts_return_type = "Promise<Json>")]
pub fn build_minecraft(opts: Option<Json>) -> Result<AsyncTask<Fetch>> {
    Ok(AsyncTask::new(Fetch::Build(options(opts)?)))
}

/// Look a version up in the version manifest and fetch its version JSON.
#[napi(js_name = "fetchClient", ts_return_type = "Promise<Json>")]
pub fn fetch_client(opts: Option<Json>) -> Result<AsyncTask<Fetch>> {
    Ok(AsyncTask::new(Fetch::Client(options(opts)?)))
}

/// Map an already-resolved version JSON, fetching only its asset manifest.
#[napi(js_name = "clientToTemplate", ts_return_type = "Promise<Json>")]
pub fn client_to_template(client: Json) -> Result<AsyncTask<Fetch>> {
    Ok(AsyncTask::new(Fetch::Template(Box::new(from_json::<
        Client,
    >(client)?))))
}

/// Fetch `version_manifest_v2.json`, or another URL serving that document.
#[napi(js_name = "fetchVersionManifest", ts_return_type = "Promise<Json>")]
pub fn fetch_version_manifest(url: Option<String>) -> AsyncTask<Fetch> {
    AsyncTask::new(Fetch::VersionManifest(url))
}

/// Fetch and parse an asset manifest.
#[napi(js_name = "fetchAssetManifest", ts_return_type = "Promise<Json>")]
pub fn fetch_asset_manifest(url: String) -> AsyncTask<Fetch> {
    AsyncTask::new(Fetch::AssetManifest(url))
}

// ──────────────────────────────────────────────────────────────────────────
// Mappers — pure, so they answer on the calling thread.
// ──────────────────────────────────────────────────────────────────────────

/// Turn a version JSON and its asset manifest into a template. The pure half
/// of `clientToTemplate`, for a caller that already holds both.
#[napi(js_name = "mapClientToTemplate")]
pub fn map_client_to_template(client: Json, assets: Json) -> Result<Json> {
    let client: Client = from_json(client)?;
    let assets: AssetManifest = from_json(assets)?;
    to_json(&opys_minecraft_vanilla::client_to_template(&client, &assets).map_err(map_err)?)
}

#[napi(js_name = "mapClientJar")]
pub fn map_client_jar(client: Json) -> Result<Json> {
    to_json(&opys_minecraft_vanilla::map_client_jar(
        &from_json::<Client>(client)?,
    ))
}

#[napi(js_name = "libraryToArtifact")]
pub fn library_to_artifact(library: Json) -> Result<Json> {
    to_json(&opys_minecraft_vanilla::library_to_artifact(&from_json::<
        Library,
    >(
        library
    )?))
}

#[napi(js_name = "mapLibraries")]
pub fn map_libraries(libraries: Json) -> Result<Json> {
    to_json(&opys_minecraft_vanilla::map_libraries(&from_json::<
        Vec<Library>,
    >(libraries)?))
}

#[napi(js_name = "mapAssetIndex")]
pub fn map_asset_index(index: Json) -> Result<Json> {
    to_json(&opys_minecraft_vanilla::map_asset_index(&from_json::<
        AssetIndex,
    >(index)?))
}

#[napi(js_name = "mapAssetObjects")]
pub fn map_asset_objects(manifest: Json) -> Result<Json> {
    to_json(&opys_minecraft_vanilla::map_asset_objects(&from_json::<
        AssetManifest,
    >(manifest)?))
}

/// The `${classpath}` arms — one per OS, each led by the client jar.
#[napi(js_name = "buildClasspath")]
pub fn build_classpath(libs: Json, client_jar_path: String) -> Result<Json> {
    let libs: Vec<ClasspathEntry> = from_json(libs)?;
    to_json(&opys_minecraft_vanilla::build_classpath(&libs, &client_jar_path).map_err(map_err)?)
}

/// `{ launch, jvmArgs, mainClass, gameArgs }` from a main class and the two
/// argument lists.
#[napi(js_name = "buildLaunch")]
pub fn build_launch(main_class: String, game_args: Json, jvm_args: Json) -> Result<Json> {
    let game: Vec<MojangArgValue> = from_json(game_args)?;
    let jvm: Vec<MojangArgValue> = from_json(jvm_args)?;
    to_json(&opys_minecraft_vanilla::build_launch(
        &main_class,
        &game,
        &jvm,
    ))
}
