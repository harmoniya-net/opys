//! napi-rs bindings for `torba-core`.
//!
//! Strategy: JSON crosses the boundary as `serde_json::Value` (napi-rs maps
//! it to native JS values). Behaviors live in Rust; the TS package's
//! `@torba/core` index is a thin re-export of these bindings + .d.ts.

#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde_json::Value as Json;
use std::collections::HashMap;

fn map_err<E: std::fmt::Display>(e: E) -> napi::Error {
    napi::Error::from_reason(e.to_string())
}

/// Decode a wire manifest (plain JS object) into the domain shape.
/// Returns the domain object as plain JS.
#[napi(js_name = "decodeManifest")]
pub fn decode_manifest(wire: Json) -> Result<Json> {
    let parsed: torba_core::ManifestWire = serde_json::from_value(wire).map_err(map_err)?;
    let m = torba_core::decode_manifest(parsed).map_err(map_err)?;
    Ok(torba_core::encode_manifest(&m))
}

/// Encode a domain manifest back to its wire form.
#[napi(js_name = "encodeManifest")]
pub fn encode_manifest(domain: Json) -> Result<Json> {
    // The domain object is just the wire shape (we don't keep separate runtime
    // types on the TS side) — pass through serde to validate and re-emit.
    let wire: torba_core::ManifestWire = serde_json::from_value(domain).map_err(map_err)?;
    let m = torba_core::decode_manifest(wire).map_err(map_err)?;
    Ok(torba_core::encode_manifest(&m))
}

/// Parse a JSON-string manifest and return the domain shape as JS.
#[napi(js_name = "parseManifest")]
pub fn parse_manifest(input: String) -> Result<Json> {
    let m = torba_core::parse_manifest(&input).map_err(map_err)?;
    Ok(torba_core::encode_manifest(&m))
}

#[napi(object, js_name = "OsOptions")]
pub struct OsOptionsJs {
    pub name: String,
    pub version: String,
    pub arch: String,
}

impl From<OsOptionsJs> for torba_core::OsOptions {
    fn from(o: OsOptionsJs) -> Self {
        torba_core::OsOptions {
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
    let resolved = torba_core::resolve_vars(&m).map_err(napi::Error::from_reason)?;
    Ok(resolved.into_iter().collect())
}

/// Substitute resolved vars into a template string.
#[napi(js_name = "interpolate")]
pub fn interpolate(template: String, vars: HashMap<String, String>) -> String {
    let m: indexmap::IndexMap<String, String> = vars.into_iter().collect();
    torba_core::interpolate(&template, &m)
}

/// Drop artifacts whose rules exclude the given platform / features.
#[napi(js_name = "filterManifest")]
pub fn filter_manifest(manifest: Json, platform: OsOptionsJs, features: Vec<String>) -> Result<Json> {
    let wire: torba_core::ManifestWire = serde_json::from_value(manifest).map_err(map_err)?;
    let m = torba_core::decode_manifest(wire).map_err(map_err)?;
    let filtered = torba_core::filter_manifest(&m, &platform.into(), &features).map_err(map_err)?;
    Ok(torba_core::encode_manifest(&filtered))
}

/// Resolve a Launch's `args` rule-tagged values for the given platform.
#[napi(js_name = "resolvedArgs")]
pub fn resolved_args(launch: Json, platform: OsOptionsJs, features: Vec<String>) -> Result<Vec<String>> {
    let wire: torba_core::LaunchWire = serde_json::from_value(launch).map_err(map_err)?;
    let l = torba_core::decode_launch(wire).map_err(map_err)?;
    torba_core::resolved_args(&l, &platform.into(), &features).map_err(map_err)
}

/// Resolve a Launch's `envs` rule-tagged values for the given platform.
#[napi(js_name = "resolvedEnvs")]
pub fn resolved_envs(
    launch: Json,
    platform: OsOptionsJs,
    features: Vec<String>,
) -> Result<HashMap<String, String>> {
    let wire: torba_core::LaunchWire = serde_json::from_value(launch).map_err(map_err)?;
    let l = torba_core::decode_launch(wire).map_err(map_err)?;
    let env = torba_core::resolved_envs(&l, &platform.into(), &features).map_err(map_err)?;
    Ok(env.into_iter().collect())
}

/// Evaluate a ruleset against a platform + active features.
#[napi(js_name = "satisfiesRuleset")]
pub fn satisfies_ruleset(rules: Json, platform: OsOptionsJs, features: Vec<String>) -> Result<bool> {
    let raw: torba_core::RawRuleset = serde_json::from_value(rules).map_err(map_err)?;
    let parsed = torba_core::parse_short_ruleset(raw).map_err(map_err)?;
    torba_mojang_rules::satisfies_ruleset(&parsed, &platform.into(), &features).map_err(map_err)
}

/// Compile a glob to its regex source.
#[napi(js_name = "globToRegexSource")]
pub fn glob_to_regex_source(glob: String) -> String {
    torba_core::glob_to_regex(&glob).as_str().to_owned()
}

/// The non-wildcard prefix of a glob, used as a sweep starting point.
#[napi(js_name = "globBase")]
pub fn glob_base(glob: String) -> String {
    torba_core::glob_base(&glob)
}

/// Single discriminated error shape (Q10 in design doc).
#[napi(object, js_name = "TorbaErrorInfo")]
pub struct TorbaErrorInfo {
    pub code: String,
    pub message: String,
}
