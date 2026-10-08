use opys_core::{Artifact, HashEntry, Integrity, Source};
use opys_mojang::{asset_path, asset_url, AssetIndex, AssetLayout, AssetManifest};

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

/// The directory a game is handed as `${game_assets}`.
///
/// Only the two old layouts read it — a modern game takes `${assets_root}`
/// and an index name — but the variable is defined for every version, so it
/// has to be right for every version.
pub fn asset_directory(manifest: &AssetManifest, index_id: &str) -> String {
    match manifest.layout() {
        AssetLayout::Objects => "${assets_root}".to_owned(),
        AssetLayout::Virtual => format!("${{assets_root}}/virtual/{index_id}"),
        AssetLayout::Resources => "${game_directory}/resources".to_owned(),
    }
}

/// One artifact per asset object, where this index's game will look for it.
/// Ordered by object name, since [`AssetManifest`] keys its objects in a
/// `BTreeMap` — an artifact list must not reshuffle between builds.
///
/// A file goes to one place, not two. The official launcher keeps the hashed
/// store as well and copies out of it; a game on an old layout never reads the
/// store, so here its files are downloaded straight to their names.
///
/// Pinned by the same sha1 that names the object. It was left off once, on the
/// belief that a content-addressed path verifies itself — but a path is only a
/// name, and nothing in the runtime reads a hash out of one. Without the pin
/// the thousands of files that make up most of an installation were the only
/// ones never checked: a truncated download was kept, and stayed.
pub fn map_asset_objects(manifest: &AssetManifest, index_id: &str) -> Vec<Artifact> {
    let directory = asset_directory(manifest, index_id);
    let layout = manifest.layout();
    manifest
        .objects
        .iter()
        .map(|(name, object)| Artifact {
            path: match layout {
                AssetLayout::Objects => {
                    format!("{directory}/objects/{}", asset_path(&object.hash))
                }
                AssetLayout::Virtual | AssetLayout::Resources => format!("{directory}/{name}"),
            },
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
