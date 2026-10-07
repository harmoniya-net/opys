//! lwjgl3ify builds, from the published document index.
//!
//! Index layout:
//!   `${source}/index.json`                          → every Minecraft version
//!   `${source}/versions/${mc}/${lwjgl3ify}.json`    → one build's version document
//!
//! Every lwjgl3ify release that ships a version document is in there, with its
//! libraries made installable — so resolving a version is one GET of the index
//! and one of the document.

use std::collections::BTreeMap;

use opys_dev::http::get_json;
use serde::{Deserialize, Serialize};

use crate::error::Lwjgl3ifyError;

/// The canonical index base URL.
pub const DEFAULT_LWJGL3IFY_INDEX: &str = "https://harmoniya-net.github.io/metadata/lwjgl3ify";

/// The three aliases the index publishes per Minecraft version.
///
/// lwjgl3ify runs no promotions endpoint, so the index decides these itself:
/// `latest` is the newest release, `recommended` the newest one GitHub does
/// not mark a prerelease, and `best` is `recommended` when there is one and
/// `latest` otherwise — which is what a bare Minecraft version resolves to.
const ALIASES: [&str; 3] = ["latest", "recommended", "best"];

/// A Minecraft version paired with the concrete lwjgl3ify build chosen for it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lwjgl3ifyRelease {
    /// Minecraft version. `1.7.10`, for every release so far.
    pub minecraft: String,
    /// lwjgl3ify release tag, e.g. `3.0.37`.
    pub lwjgl3ify: String,
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
    build: String,
    url: String,
}

impl VersionEntryWire {
    fn alias(&self, alias: &str) -> Option<(&str, &str)> {
        let (lwjgl3ify, url) = match alias {
            "latest" => (&self.latest, &self.latest_url),
            "recommended" => (&self.recommended, &self.recommended_url),
            _ => (&self.best, &self.best_url),
        };
        Some((lwjgl3ify.as_deref()?, url.as_deref()?))
    }
}

/// Resolve a version string against the index.
///
/// Accepted forms, in the order they are tried:
///   - `1.7.10-recommended` — an alias suffix on a Minecraft version
///   - `1.7.10` — a bare Minecraft version, meaning its `best` build
///   - `3.0.37` — a full lwjgl3ify release tag
///
/// The tag is looked up rather than parsed, as everywhere in this family: it
/// names no Minecraft version at all, so scanning the index is the only way to
/// learn which one it belongs to.
pub fn resolve_lwjgl3ify_version(
    input: &str,
    source: &str,
) -> Result<Lwjgl3ifyRelease, Lwjgl3ifyError> {
    let base = source.trim_end_matches('/');
    let index: IndexWire = get_json(&format!("{base}/index.json"), &[])?;

    let release = |minecraft: &str, lwjgl3ify: &str, url: &str| Lwjgl3ifyRelease {
        minecraft: minecraft.to_owned(),
        lwjgl3ify: lwjgl3ify.to_owned(),
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
                .ok_or_else(|| Lwjgl3ifyError::UnknownMinecraft {
                    minecraft: minecraft.to_owned(),
                    input: input.to_owned(),
                })?;
        let (lwjgl3ify, url) = entry
            .alias(alias)
            .ok_or_else(|| Lwjgl3ifyError::NoAliasBuild {
                alias: alias.to_owned(),
                minecraft: minecraft.to_owned(),
            })?;
        return Ok(release(minecraft, lwjgl3ify, url));
    }

    if let Some(entry) = index.versions.get(input) {
        let (lwjgl3ify, url) = entry
            .alias("best")
            .ok_or_else(|| Lwjgl3ifyError::NoAliasBuild {
                alias: "best".to_owned(),
                minecraft: input.to_owned(),
            })?;
        return Ok(release(input, lwjgl3ify, url));
    }

    for (minecraft, entry) in &index.versions {
        if let Some(build) = entry.builds.iter().find(|b| b.build == input) {
            return Ok(release(minecraft, &build.build, &build.url));
        }
    }

    Err(Lwjgl3ifyError::UnresolvableVersion {
        input: input.to_owned(),
        source_url: base.to_owned(),
    })
}
