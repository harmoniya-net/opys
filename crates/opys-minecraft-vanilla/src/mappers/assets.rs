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
        discovery: None,
        metadata: None,
        extract: None,
    }
}

/// One artifact per asset object. Ordered by object name, since
/// [`AssetManifest`] keys its objects in a `BTreeMap` — an artifact list must
/// not reshuffle between builds.
///
/// No `integrity`: the hash *is* the path, so the runtime's content-addressed
/// layout verifies these on its own.
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
            integrity: None,
            discovery: None,
            metadata: Some(serde_json::json!({ "name": name })),
            extract: None,
        })
        .collect()
}
