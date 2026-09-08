//! Fabric loader versions, from the Fabric Meta API.
//!
//! Meta layout (v2):
//!   `${meta}/v2/versions/loader/${game}`                       → loader builds for a MC version
//!   `${meta}/v2/versions/loader/${game}/${loader}/profile/json` → the launcher profile JSON
//!
//! Unlike Forge and NeoForge, a Fabric loader version is independent of the
//! Minecraft version, so the two stay separate: `game` is always the Minecraft
//! version and the loader is an explicit option. With no loader pinned we ask
//! Meta for the newest build targeting that game version, preferring `stable`.

use opys_dev::http::get_json;
use serde::{Deserialize, Serialize};

use crate::error::FabricError;

/// The canonical Fabric Meta base URL.
pub const DEFAULT_FABRIC_META: &str = "https://meta.fabricmc.net";

/// A game version paired with the concrete loader build that targets it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FabricRelease {
    /// Minecraft (game) version, e.g. `1.21.4`.
    pub game_version: String,
    /// Fabric loader version, e.g. `0.16.10`.
    pub loader_version: String,
    /// Direct URL to the launcher profile JSON on the Meta API.
    pub profile_url: String,
}

/// One entry of `${meta}/v2/versions/loader/${game}` — only the bits we read.
#[derive(Deserialize)]
pub(crate) struct LoaderEntryWire {
    loader: LoaderWire,
}

#[derive(Deserialize)]
pub(crate) struct LoaderWire {
    version: String,
    #[serde(default)]
    stable: bool,
}

fn profile_url(base: &str, game: &str, loader: &str) -> String {
    format!("{base}/v2/versions/loader/{game}/{loader}/profile/json")
}

/// Resolve a game version (and optional loader) to a concrete Fabric release.
///
/// With an explicit `loader` no Meta lookup is needed — the profile URL is
/// built directly. Without one the newest loader build for `game` is selected;
/// `stable` builds win over pre-releases, and Meta returns the list
/// newest-first, so the first match is the latest.
pub fn resolve_fabric_version(
    game: &str,
    meta: &str,
    loader: Option<&str>,
) -> Result<FabricRelease, FabricError> {
    let base = meta.trim_end_matches('/');

    if let Some(loader) = loader {
        return Ok(FabricRelease {
            game_version: game.to_owned(),
            loader_version: loader.to_owned(),
            profile_url: profile_url(base, game, loader),
        });
    }

    let url = format!("{base}/v2/versions/loader/{game}");
    let builds: Vec<LoaderEntryWire> = get_json(&url, &[])?;
    let chosen = builds
        .iter()
        .find(|b| b.loader.stable)
        .or(builds.first())
        .ok_or_else(|| FabricError::NoLoaderBuild(game.to_owned()))?;
    let loader_version = chosen.loader.version.clone();

    Ok(FabricRelease {
        game_version: game.to_owned(),
        profile_url: profile_url(base, game, &loader_version),
        loader_version,
    })
}
