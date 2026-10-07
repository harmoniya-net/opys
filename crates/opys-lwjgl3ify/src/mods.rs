//! The two jars that go in `mods/`: lwjgl3ify itself, and UniMixins.
//!
//! Neither is a library. RetroFuturaBootstrap's plugin loader scans
//! `${game_directory}/mods/` at startup, and the lwjgl3ify jar is where it
//! finds the plugin that makes FML run on a current JVM; lwjgl3ify's coremod
//! in turn implements `IEarlyMixinLoader`, which UniMixins provides. Upstream
//! leaves both to the user. opys installs them, because a manifest that
//! resolves and then fails with `NoClassDefFoundError` is not a resolved one.

use opys_core::{Artifact, HashEntry, Integrity, Source};
use opys_dev::github::{
    fetch_github_release, github_asset_sha256, pick_github_release, GitHubAsset, GitHubRelease,
    ReleaseSelector,
};
use serde::{Deserialize, Serialize};

use crate::error::Lwjgl3ifyError;

pub const DEFAULT_LWJGL3IFY_REPO: &str = "GTNewHorizons/lwjgl3ify";
pub const DEFAULT_UNIMIXINS_REPO: &str = "LegacyModdingMC/UniMixins";

/// Which UniMixins to install.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct UnimixinsOptions {
    /// A tag, `latest`, or `prerelease`. `None` is `latest`.
    pub version: Option<String>,
    /// GitHub repo `owner/name`. `None` is [`DEFAULT_UNIMIXINS_REPO`].
    pub repo: Option<String>,
}

/// Whether to install UniMixins, and which.
///
/// Written `false` to opt out — for a pack that ships its own mixin runtime —
/// or as [`UnimixinsOptions`] to choose one; left out, it is the newest
/// release. `true` reads as the default too, since that is what it would mean.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "UnimixinsWire", into = "UnimixinsWire")]
pub enum Unimixins {
    Skip,
    Install(UnimixinsOptions),
}

impl Default for Unimixins {
    fn default() -> Self {
        Unimixins::Install(UnimixinsOptions::default())
    }
}

#[derive(Serialize, Deserialize)]
#[serde(untagged)]
pub(crate) enum UnimixinsWire {
    Flag(bool),
    Options(UnimixinsOptions),
}

impl From<UnimixinsWire> for Unimixins {
    fn from(wire: UnimixinsWire) -> Self {
        match wire {
            UnimixinsWire::Flag(false) => Unimixins::Skip,
            UnimixinsWire::Flag(true) => Unimixins::default(),
            UnimixinsWire::Options(options) => Unimixins::Install(options),
        }
    }
}

impl From<Unimixins> for UnimixinsWire {
    fn from(unimixins: Unimixins) -> Self {
        match unimixins {
            Unimixins::Skip => UnimixinsWire::Flag(false),
            Unimixins::Install(options) => UnimixinsWire::Options(options),
        }
    }
}

/// The plain `lwjgl3ify-<tag>.jar` — not `-dev`, `-api`, `-sources` or
/// `-forgePatches`. It is matched by its whole name for that reason.
pub fn mod_jar(release: &GitHubRelease) -> Option<&GitHubAsset> {
    let expected = format!("lwjgl3ify-{}.jar", release.tag_name);
    release.assets.iter().find(|a| a.name == expected)
}

/// UniMixins's all-in-one jar for 1.7.10, `+unimixins-all-1.7.10-<v>.jar`.
pub fn unimixins_jar(release: &GitHubRelease) -> Option<&GitHubAsset> {
    release.assets.iter().find(|a| {
        a.name.starts_with("+unimixins-all-1.7.10-")
            && a.name.ends_with(".jar")
            && !a.name.contains("-dev")
    })
}

/// A release asset as an artifact under `mods/`.
pub fn mod_artifact(asset: &GitHubAsset) -> Artifact {
    Artifact {
        path: format!("${{game_directory}}/mods/{}", asset.name),
        source: Source::Url {
            url: asset.browser_download_url.clone(),
        },
        size: Some(asset.size),
        rules: Vec::new(),
        integrity: github_asset_sha256(asset).map(|sha256| {
            Integrity::One(HashEntry::Sha256 {
                sha256: sha256.to_owned(),
            })
        }),
        metadata: None,
        extract: None,
    }
}

/// The lwjgl3ify mod jar of the release tagged `tag`.
///
/// Fetched by tag, not found in the listing: the tag is already known from the
/// index, and lwjgl3ify has more releases than one page of the listing holds.
pub(crate) fn fetch_mod_jar(
    api_base: &str,
    repo: &str,
    tag: &str,
    token: Option<&str>,
) -> Result<Artifact, Lwjgl3ifyError> {
    let release = fetch_github_release(api_base, repo, tag, token)?;
    let asset = mod_jar(&release).ok_or_else(|| Lwjgl3ifyError::NoModJar {
        tag: tag.to_owned(),
        repo: repo.to_owned(),
        what: "lwjgl3ify mod jar",
    })?;
    Ok(mod_artifact(asset))
}

/// The UniMixins jar `options` asks for.
pub(crate) fn fetch_unimixins(
    api_base: &str,
    options: &UnimixinsOptions,
    token: Option<&str>,
) -> Result<Artifact, Lwjgl3ifyError> {
    let repo = options.repo.as_deref().unwrap_or(DEFAULT_UNIMIXINS_REPO);
    let has_jar = |r: &GitHubRelease| unimixins_jar(r).is_some();

    let release = match options.version.as_deref() {
        None | Some("latest") => pick_github_release(
            api_base,
            repo,
            &ReleaseSelector::Latest,
            token,
            Some(&has_jar),
        )?,
        Some("prerelease") => pick_github_release(
            api_base,
            repo,
            &ReleaseSelector::Prerelease,
            token,
            Some(&has_jar),
        )?,
        Some(tag) => fetch_github_release(api_base, repo, tag, token)?,
    };
    let asset = unimixins_jar(&release).ok_or_else(|| Lwjgl3ifyError::NoModJar {
        tag: release.tag_name.clone(),
        repo: repo.to_owned(),
        what: "UniMixins jar for 1.7.10",
    })?;
    Ok(mod_artifact(asset))
}
