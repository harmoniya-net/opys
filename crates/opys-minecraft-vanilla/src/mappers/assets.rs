use opys_core::{Artifact, HashEntry, Integrity, Source};
use opys_mojang::{asset_path, asset_url, AssetIndex, AssetManifest};

/// The asset index document itself.
pub fn map_asset_index(index: &AssetIndex) -> Artifact {
    Artifact {
        path: format!("${{assets_root}}/indexes/{}.json", index.id),
        source: Source::Url {
            url: index.url.clone(),
        },
        size: Some(index.size),
        rules: Vec::new(),
        integrity: Some(Integrity::One(HashEntry::Sha1 {
            sha1: index.sha1.clone(),
        })),
        metadata: None,
        extract: None,
    }
}

/// One artifact per asset object. Ordered by object name, since
/// [`AssetManifest`] keys its objects in a `BTreeMap` — an artifact list must
/// not reshuffle between builds.
///
/// Pinned by the same sha1 that names the object. It was left off once, on the
/// belief that a content-addressed path verifies itself — but a path is only a
/// name, and nothing in the runtime reads a hash out of one. Without the pin
/// the thousands of files that make up most of an installation were the only
/// ones never checked: a truncated download was kept, and stayed.
pub fn map_asset_objects(manifest: &AssetManifest) -> Vec<Artifact> {
    manifest
        .objects
        .iter()
        .map(|(name, object)| Artifact {
            path: format!("${{assets_root}}/objects/{}", asset_path(&object.hash)),
            source: Source::Url {
                url: asset_url(&object.hash),
            },
            size: Some(object.size),
            rules: Vec::new(),
            integrity: Some(Integrity::One(HashEntry::Sha1 {
                sha1: object.hash.clone(),
            })),
            metadata: Some(serde_json::json!({ "name": name })),
            extract: None,
        })
        .collect()
}
