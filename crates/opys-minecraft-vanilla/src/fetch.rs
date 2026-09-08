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

use opys_dev::http::get_json;
use opys_mojang::{AssetManifest, Client, Version, VersionManifest, VERSION_MANIFEST_URL};

use crate::error::MinecraftError;

/// Fetch `version_manifest_v2.json`. `base` overrides the canonical URL —
/// the seam the tests point at a loopback server.
pub fn fetch_version_manifest(base: Option<&str>) -> Result<VersionManifest, MinecraftError> {
    Ok(get_json(base.unwrap_or(VERSION_MANIFEST_URL), &[])?)
}

/// Fetch and parse an asset manifest.
pub fn fetch_asset_manifest(url: &str) -> Result<AssetManifest, MinecraftError> {
    Ok(get_json(url, &[])?)
}

/// Resolve a version id (or the current release) to its manifest entry and
/// its version JSON.
///
/// The version JSON arrives as a `serde_json::Value` on purpose: it is
/// Mojang's spelling, not `Client`'s own, so reading it is the named
/// [`Client::from_version_json`] rather than a `Deserialize` impl.
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
    let raw: serde_json::Value = get_json(&version.url, &[])?;
    let client = Client::from_version_json(raw)?;
    Ok((version, client))
}
