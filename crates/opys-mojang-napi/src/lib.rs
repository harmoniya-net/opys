//! napi-rs bindings for `opys-mojang`.
//!
//! Strategy mirrors `opys-core-napi`: JSON crosses the boundary as
//! `serde_json::Value` (napi-rs maps it to native JS values), behaviours live
//! in Rust, and `@opys/mojang`'s TS index is a thin re-export plus a
//! hand-written `.d.ts`.
//!
//! This addon also exposes the `opys-mojang-rules` surface — the crate is
//! linked in statically anyway — so `@opys/mojang` stands alone without
//! `@opys/core`. Note the contract difference: `satisfiesRuleset` here is
//! **strict** Mojang format, whereas `@opys/core`'s counterpart first expands
//! opys shorthand and therefore accepts both forms.

#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde_json::Value as Json;

use opys_mojang_rules::{
    satisfies_features, satisfies_os, satisfies_rule, satisfies_ruleset, FeatureConstraint,
    MojangRule, MojangRuleset, OsConstraint,
};

fn map_err<E: std::fmt::Display>(e: E) -> napi::Error {
    napi::Error::from_reason(e.to_string())
}

#[napi(object, js_name = "OsOptions")]
pub struct OsOptionsJs {
    pub name: String,
    pub version: String,
    pub arch: String,
}

impl From<OsOptionsJs> for opys_mojang_rules::OsOptions {
    fn from(o: OsOptionsJs) -> Self {
        opys_mojang_rules::OsOptions {
            name: o.name,
            version: o.version,
            arch: o.arch,
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────
// Protocol parsers
// ──────────────────────────────────────────────────────────────────────────

/// Parse a version-JSON client document into the domain shape.
#[napi(js_name = "parseClient")]
pub fn parse_client(raw: Json) -> Result<Json> {
    let client: opys_mojang::Client = serde_json::from_value(raw).map_err(map_err)?;
    serde_json::to_value(client).map_err(map_err)
}

/// Parse the `libraries` array of a version JSON.
#[napi(js_name = "parseLibraries")]
pub fn parse_libraries(raws: Json) -> Result<Json> {
    let libs: opys_mojang::Libraries = serde_json::from_value(raws).map_err(map_err)?;
    serde_json::to_value(libs).map_err(map_err)
}

/// Parse `arguments` (modern object) or `minecraftArguments` (legacy string).
#[napi(js_name = "parseArguments")]
pub fn parse_arguments(raw: Json) -> Result<Json> {
    let args: opys_mojang::Arguments = serde_json::from_value(raw).map_err(map_err)?;
    serde_json::to_value(args).map_err(map_err)
}

/// Merge a patch version's args onto a base version's (`inheritsFrom`).
#[napi(js_name = "mergeArgs")]
pub fn merge_args(base: Json, patch: Json) -> Result<Json> {
    let base: opys_mojang::Arguments = serde_json::from_value(base).map_err(map_err)?;
    let patch: opys_mojang::Arguments = serde_json::from_value(patch).map_err(map_err)?;
    serde_json::to_value(base.merge(&patch)).map_err(map_err)
}

/// Parse an asset manifest (`objects` map).
#[napi(js_name = "parseAssetManifest")]
pub fn parse_asset_manifest(raw: Json) -> Result<Json> {
    let m: opys_mojang::AssetManifest = serde_json::from_value(raw).map_err(map_err)?;
    serde_json::to_value(m).map_err(map_err)
}

/// Parse `version_manifest_v2.json`.
#[napi(js_name = "parseVersionManifest")]
pub fn parse_version_manifest(raw: Json) -> Result<Json> {
    let m: opys_mojang::VersionManifest = serde_json::from_value(raw).map_err(map_err)?;
    serde_json::to_value(m).map_err(map_err)
}

/// Look up a version by id. Returns `null` when absent.
#[napi(js_name = "findVersion")]
pub fn find_version(manifest: Json, id: String) -> Result<Json> {
    let m: opys_mojang::VersionManifest = serde_json::from_value(manifest).map_err(map_err)?;
    match m.find(&id) {
        Some(v) => serde_json::to_value(v).map_err(map_err),
        None => Ok(Json::Null),
    }
}

/// The manifest's current release version. Throws when it is missing.
#[napi(js_name = "latestRelease")]
pub fn latest_release(manifest: Json) -> Result<Json> {
    let m: opys_mojang::VersionManifest = serde_json::from_value(manifest).map_err(map_err)?;
    let v = m
        .latest_release()
        .ok_or_else(|| napi::Error::from_reason("No release version found in manifest"))?;
    serde_json::to_value(v).map_err(map_err)
}

/// The canonical version-manifest URL.
#[napi(js_name = "versionManifestUrl")]
pub fn version_manifest_url() -> &'static str {
    opys_mojang::VERSION_MANIFEST_URL
}

// ──────────────────────────────────────────────────────────────────────────
// Assets + Maven
// ──────────────────────────────────────────────────────────────────────────

#[napi(js_name = "assetUrl")]
pub fn asset_url(hash: String) -> String {
    opys_mojang::asset_url(&hash)
}

#[napi(js_name = "assetPath")]
pub fn asset_path(hash: String) -> String {
    opys_mojang::asset_path(&hash)
}

#[napi(js_name = "parseMaven")]
pub fn parse_maven(value: String) -> Result<Json> {
    let c: opys_mojang::MavenCoord = value.parse().map_err(map_err)?;
    serde_json::to_value(c).map_err(map_err)
}

#[napi(js_name = "encodeMaven")]
pub fn encode_maven(coord: Json) -> Result<String> {
    let c: opys_mojang::MavenCoord = serde_json::from_value(coord).map_err(map_err)?;
    Ok(c.to_string())
}

#[napi(js_name = "isNativeMaven")]
pub fn is_native_maven(coord: Json) -> Result<bool> {
    let c: opys_mojang::MavenCoord = serde_json::from_value(coord).map_err(map_err)?;
    Ok(c.is_native())
}

#[napi(js_name = "mavenMatchesIgnoringVersion")]
pub fn maven_matches_ignoring_version(a: Json, b: Json) -> Result<bool> {
    let a: opys_mojang::MavenCoord = serde_json::from_value(a).map_err(map_err)?;
    let b: opys_mojang::MavenCoord = serde_json::from_value(b).map_err(map_err)?;
    Ok(a.matches_ignoring_version(&b))
}

// ──────────────────────────────────────────────────────────────────────────
// Mojang rules — strict format, no opys shorthand
// ──────────────────────────────────────────────────────────────────────────

/// Decode a ruleset in strict Mojang form. A shorthand string such as
/// `"allow.os.linux"` is an error here — that spelling is opys's own, and
/// belongs to `@opys/core`.
#[napi(js_name = "decodeRuleset")]
pub fn decode_ruleset(raw: Json) -> Result<Json> {
    let rules: MojangRuleset = serde_json::from_value(raw).map_err(map_err)?;
    serde_json::to_value(rules).map_err(map_err)
}

#[napi(js_name = "encodeRuleset")]
pub fn encode_ruleset(ruleset: Json) -> Result<Json> {
    let rules: MojangRuleset = serde_json::from_value(ruleset).map_err(map_err)?;
    serde_json::to_value(rules).map_err(map_err)
}

/// Evaluate a strict Mojang ruleset against a platform + active features.
#[napi(js_name = "satisfiesRuleset")]
pub fn satisfies_ruleset_js(
    rules: Json,
    platform: OsOptionsJs,
    features: Vec<String>,
) -> Result<bool> {
    let rules: MojangRuleset = serde_json::from_value(rules).map_err(map_err)?;
    satisfies_ruleset(&rules, &platform.into(), &features).map_err(map_err)
}

#[napi(js_name = "satisfiesRule")]
pub fn satisfies_rule_js(rule: Json, platform: OsOptionsJs, features: Vec<String>) -> Result<bool> {
    let rule: MojangRule = serde_json::from_value(rule).map_err(map_err)?;
    satisfies_rule(&rule, &platform.into(), &features).map_err(map_err)
}

#[napi(js_name = "satisfiesOs")]
pub fn satisfies_os_js(constraint: Json, platform: OsOptionsJs) -> Result<bool> {
    let c: OsConstraint = serde_json::from_value(constraint).map_err(map_err)?;
    satisfies_os(&c, &platform.into()).map_err(map_err)
}

#[napi(js_name = "satisfiesFeatures")]
pub fn satisfies_features_js(constraint: Json, features: Vec<String>) -> Result<bool> {
    let c: FeatureConstraint = serde_json::from_value(constraint).map_err(map_err)?;
    Ok(satisfies_features(&c, &features))
}
