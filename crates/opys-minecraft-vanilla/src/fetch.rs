//! The Mojang endpoints, fetched.
//!
//! `opys-mojang` is a pure parser, so the requests live here — with the one
//! caller that needs them. Every loader in this crate starts from a vanilla
//! version JSON, which is why this sits beside the mappers rather than inside
//! the vanilla module.
//!
//! Build-time only: one blocking GET apiece, through `opys-dev`. Retry,
//! resume and progress belong to the install path in `opys-runtime` and must
//! never leak in here.

use opys_dev::http;
use opys_mojang::{AssetManifest, Client, Version, VersionManifest, VERSION_MANIFEST_URL};

use crate::error::MinecraftError;

/// GET a URL and parse the body as JSON, mapping a non-2xx to [`MinecraftError::Api`].
fn get_json(url: &str) -> Result<serde_json::Value, MinecraftError> {
    let response = http::get(url, &[])?;
    if !response.ok() {
        return Err(MinecraftError::Api {
            url: url.to_owned(),
            status: response.status,
        });
    }
    Ok(serde_json::from_str(&response.body)?)
}

/// Fetch `version_manifest_v2.json`. `base` overrides the canonical URL —
/// the seam the tests point at a loopback server.
pub fn fetch_version_manifest(base: Option<&str>) -> Result<VersionManifest, MinecraftError> {
    let url = base.unwrap_or(VERSION_MANIFEST_URL);
    Ok(serde_json::from_value(get_json(url)?)?)
}

/// Fetch and parse an asset manifest.
pub fn fetch_asset_manifest(url: &str) -> Result<AssetManifest, MinecraftError> {
    Ok(serde_json::from_value(get_json(url)?)?)
}

/// Resolve a version id (or the current release) to its manifest entry and
/// its version JSON.
pub fn fetch_client(
    version_id: Option<&str>,
    manifest_base: Option<&str>,
) -> Result<(Version, Client), MinecraftError> {
    let manifest = fetch_version_manifest(manifest_base)?;
    let version = match version_id {
        Some(id) => manifest
            .find(id)
            .ok_or_else(|| MinecraftError::VersionNotFound(id.to_owned()))?,
        None => manifest
            .latest_release()
            .ok_or(MinecraftError::NoLatestRelease)?,
    }
    .clone();
    let client = Client::from_version_json(get_json(&version.url)?)?;
    Ok((version, client))
}
