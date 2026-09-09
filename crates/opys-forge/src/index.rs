//! Forge builds, from the published document index.
//!
//! Index layout:
//!   `${source}/index.json`                      → every Minecraft version
//!   `${source}/versions/${mc}/${forge}.json`    → one build's version document
//!
//! Every Forge build that has ever shipped is in there as an ordinary
//! `inheritsFrom` version JSON, generated once and published — so resolving a
//! version is one GET of the index and one of the document, with no installer
//! to read and no era to branch on.

use std::collections::BTreeMap;

use opys_dev::http::get_json;
use serde::{Deserialize, Serialize};

use crate::error::ForgeError;

/// The canonical index base URL.
pub const DEFAULT_FORGE_INDEX: &str = "https://harmoniya-net.github.io/ForgeWrapper";

/// The three aliases the index publishes per Minecraft version.
///
/// `latest` and `recommended` are Forge's own promotions; `best` is
/// `recommended` when there is one and `latest` otherwise, which is the choice
/// a bare Minecraft version resolves to.
const ALIASES: [&str; 3] = ["latest", "recommended", "best"];

/// A Minecraft version paired with the concrete Forge build chosen for it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgeRelease {
    /// Minecraft version, e.g. `1.20.1`.
    pub minecraft: String,
    /// Forge build id, e.g. `1.20.1-47.4.10`.
    pub forge: String,
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
    forge: String,
    url: String,
}

impl VersionEntryWire {
    fn alias(&self, alias: &str) -> Option<(&str, &str)> {
        let (forge, url) = match alias {
            "latest" => (&self.latest, &self.latest_url),
            "recommended" => (&self.recommended, &self.recommended_url),
            _ => (&self.best, &self.best_url),
        };
        Some((forge.as_deref()?, url.as_deref()?))
    }
}

/// Resolve a version string against the index.
///
/// Accepted forms, in the order they are tried:
///   - `1.20.1-recommended` — an alias suffix on a Minecraft version
///   - `1.20.1` — a bare Minecraft version, meaning its `best` build
///   - `1.20.1-47.4.10` — a full Forge build id
///
/// A build id carries no field saying which Minecraft version it belongs to,
/// and its shape does not say either — the 1.7.10 era spells one
/// `1.7.10-10.13.4.1614-1.7.10`, repeating the version at both ends. So it is
/// looked up in the index rather than parsed: every Minecraft key the id could
/// sit under is tried, longest first, and the first that actually lists the
/// build wins.
pub fn resolve_forge_version(input: &str, source: &str) -> Result<ForgeRelease, ForgeError> {
    let base = source.trim_end_matches('/');
    let index: IndexWire = get_json(&format!("{base}/index.json"), &[])?;

    let release = |minecraft: &str, forge: &str, url: &str| ForgeRelease {
        minecraft: minecraft.to_owned(),
        forge: forge.to_owned(),
        document_url: url.to_owned(),
    };

    for alias in ALIASES {
        let Some(minecraft) = input.strip_suffix(&format!("-{alias}")) else {
            continue;
        };
        let entry = index
            .versions
            .get(minecraft)
            .ok_or_else(|| ForgeError::UnknownMinecraft {
                minecraft: minecraft.to_owned(),
                input: input.to_owned(),
            })?;
        let (forge, url) = entry.alias(alias).ok_or_else(|| ForgeError::NoAliasBuild {
            alias: alias.to_owned(),
            minecraft: minecraft.to_owned(),
        })?;
        return Ok(release(minecraft, forge, url));
    }

    if let Some(entry) = index.versions.get(input) {
        let (forge, url) = entry
            .alias("best")
            .ok_or_else(|| ForgeError::NoAliasBuild {
                alias: "best".to_owned(),
                minecraft: input.to_owned(),
            })?;
        return Ok(release(input, forge, url));
    }

    // Longest first, so that a build listed under two keys resolves to the
    // more specific one rather than to whichever the map iterates first.
    let mut candidates: Vec<&String> = index
        .versions
        .keys()
        .filter(|mc| input.starts_with(&format!("{mc}-")))
        .collect();
    candidates.sort_by_key(|mc| std::cmp::Reverse(mc.len()));

    for minecraft in candidates {
        if let Some(build) = index.versions[minecraft]
            .builds
            .iter()
            .find(|b| b.forge == input)
        {
            return Ok(release(minecraft, &build.forge, &build.url));
        }
    }

    Err(ForgeError::UnresolvableVersion {
        input: input.to_owned(),
        source_url: base.to_owned(),
    })
}
