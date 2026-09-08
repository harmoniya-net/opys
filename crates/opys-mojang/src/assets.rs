//! Asset index + asset manifest. Mirrors `packages/mojang/lib/client/assets.ts`.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetIndex {
    pub id: String,
    pub sha1: String,
    pub size: u64,
    pub total_size: u64,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetObject {
    pub hash: String,
    pub size: u64,
}

/// A `BTreeMap` rather than a `HashMap`: the objects are a keyed set to
/// Mojang, but iterating them produces manifest artifacts, and an artifact
/// list must not reorder between builds. Sorting by name is also exactly the
/// order this map already reaches JS in, since `serde_json::Value` keeps its
/// object keys sorted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetManifest {
    pub objects: BTreeMap<String, AssetObject>,
}

/// First two characters of a hash — the shard directory. Total: a hash
/// shorter than two bytes, or one that would split a UTF-8 char, yields the
/// whole string, matching JS `slice(0, 2)` rather than panicking.
fn shard(hash: &str) -> &str {
    hash.get(..2).unwrap_or(hash)
}

/// Download URL for an asset object, derived from its hash.
pub fn asset_url(hash: &str) -> String {
    format!(
        "https://resources.download.minecraft.net/{}/{}",
        shard(hash),
        hash
    )
}

/// Path of an asset object within the objects directory.
pub fn asset_path(hash: &str) -> String {
    format!("{}/{}", shard(hash), hash)
}
