//! NeoForge builds, from the published document index.
//!
//! Index layout:
//!   `${source}/index.json`                         → every Minecraft version
//!   `${source}/versions/${mc}/${neoforge}.json`    → one build's version document
//!
//! Every NeoForge build is in there as an ordinary `inheritsFrom` version
//! JSON, generated once from the installer and published — so resolving a
//! version is one GET of the index and one of the document, with no installer
//! to open and no processors to reason about at build time.

use std::collections::BTreeMap;

use opys_dev::http::get_json;
use serde::{Deserialize, Serialize};

use crate::error::NeoForgeError;

/// The canonical index base URL.
pub const DEFAULT_NEOFORGE_INDEX: &str = "https://harmoniya-net.github.io/ForgeWrapper/neoforge";

/// The three aliases the index publishes per Minecraft version.
///
/// NeoForge runs no promotions endpoint, so the index decides these itself:
/// `latest` is the newest build, `recommended` the newest one whose version
/// carries no qualifier, and `best` is `recommended` when there is one and
/// `latest` otherwise — which is what a bare Minecraft version resolves to.
const ALIASES: [&str; 3] = ["latest", "recommended", "best"];

/// A Minecraft version paired with the concrete NeoForge build chosen for it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NeoForgeRelease {
    /// Minecraft version, e.g. `1.21.1`.
    pub minecraft: String,
    /// NeoForge build id, e.g. `21.1.172`.
    pub neoforge: String,
    /// Direct URL to that build's version document.
    pub document_url: String,
}

#[derive(Deserialize)]
pub(crate) struct IndexWire {
    versions: BTreeMap<String, VersionEntryWire>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VersionEntryWire {
    #[serde(default)]
    latest: Option<String>,
    #[serde(default)]
    latest_url: Option<String>,
    #[serde(default)]
    recommended: Option<String>,
    #[serde(default)]
    recommended_url: Option<String>,
    #[serde(default)]
    best: Option<String>,
    #[serde(default)]
    best_url: Option<String>,
    #[serde(default)]
    builds: Vec<BuildWire>,
}

#[derive(Deserialize)]
pub(crate) struct BuildWire {
    neoforge: String,
    url: String,
}

impl VersionEntryWire {
    fn alias(&self, alias: &str) -> Option<(&str, &str)> {
        let (neoforge, url) = match alias {
            "latest" => (&self.latest, &self.latest_url),
            "recommended" => (&self.recommended, &self.recommended_url),
            _ => (&self.best, &self.best_url),
        };
        Some((neoforge.as_deref()?, url.as_deref()?))
    }
}

/// Resolve a version string against the index.
///
/// Accepted forms, in the order they are tried:
///   - `1.21.1-recommended` — an alias suffix on a Minecraft version
///   - `1.21.1` — a bare Minecraft version, meaning its `best` build
///   - `21.1.172` — a full NeoForge build id
///
/// The build id is looked up rather than parsed. `21.1.172` does encode
/// Minecraft 1.21.1, and for years every version did — which is exactly why
/// deriving it looks safe. `26.2.0.84` carries four components and targets
/// Minecraft `26.2`, which has no leading `1.` at all, so a build id and the
/// Minecraft version it belongs to need share no text whatsoever. Scanning the
/// index is the only lookup that survives that.
pub fn resolve_neoforge_version(
    input: &str,
    source: &str,
) -> Result<NeoForgeRelease, NeoForgeError> {
    let base = source.trim_end_matches('/');
    let index: IndexWire = get_json(&format!("{base}/index.json"), &[])?;

    let release = |minecraft: &str, neoforge: &str, url: &str| NeoForgeRelease {
        minecraft: minecraft.to_owned(),
        neoforge: neoforge.to_owned(),
        document_url: url.to_owned(),
    };

    for alias in ALIASES {
        let Some(minecraft) = input.strip_suffix(&format!("-{alias}")) else {
            continue;
        };
        let entry =
            index
                .versions
                .get(minecraft)
                .ok_or_else(|| NeoForgeError::UnknownMinecraft {
                    minecraft: minecraft.to_owned(),
                    input: input.to_owned(),
                })?;
        let (neoforge, url) = entry
            .alias(alias)
            .ok_or_else(|| NeoForgeError::NoAliasBuild {
                alias: alias.to_owned(),
                minecraft: minecraft.to_owned(),
            })?;
        return Ok(release(minecraft, neoforge, url));
    }

    if let Some(entry) = index.versions.get(input) {
        let (neoforge, url) = entry
            .alias("best")
            .ok_or_else(|| NeoForgeError::NoAliasBuild {
                alias: "best".to_owned(),
                minecraft: input.to_owned(),
            })?;
        return Ok(release(input, neoforge, url));
    }

    for (minecraft, entry) in &index.versions {
        if let Some(build) = entry.builds.iter().find(|b| b.neoforge == input) {
            return Ok(release(minecraft, &build.neoforge, &build.url));
        }
    }

    Err(NeoForgeError::UnresolvableVersion {
        input: input.to_owned(),
        source_url: base.to_owned(),
    })
}
