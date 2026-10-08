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
    /// Set by the `legacy` index — 1.6 through 1.7.2. See [`AssetLayout`].
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub r#virtual: bool,
    /// Set by the `pre-1.6` index. See [`AssetLayout`].
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub map_to_resources: bool,
}

/// Where a game expects to find its assets, which the index says and the
/// version does not.
///
/// The hashed store is what every release since 1.7.3 reads, through an index
/// it is told the name of. The two before it read files by their own names,
/// and say so with a flag on the index — a game given a hashed store instead
/// starts and runs with no sound.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AssetLayout {
    /// `objects/<ab>/<hash>`, looked up through the index.
    Objects,
    /// 1.6-1.7.2: the same files under their names, in a directory the game is
    /// handed as `--assetsDir`.
    Virtual,
    /// Before 1.6: under their names in `resources/` of the game directory,
    /// where the game also looks unasked. It then tries to refresh them from a
    /// bucket Mojang retired, fails, and falls back to what is on disk.
    Resources,
}

impl AssetManifest {
    pub fn layout(&self) -> AssetLayout {
        if self.map_to_resources {
            AssetLayout::Resources
        } else if self.r#virtual {
            AssetLayout::Virtual
        } else {
            AssetLayout::Objects
        }
    }
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
