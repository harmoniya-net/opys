//! `.mrpack` modpacks.

use std::collections::BTreeMap;

use opys_core::{Artifact, HashEntry, Integrity, Source};
use opys_dev::http::{get_bytes, get_json};
use opys_modpack::{LoaderSpec, PackArchive};
use serde::{Deserialize, Serialize};

use crate::error::ModrinthError;
use crate::reference::{parse_modpack_ref, ModpackRef};

/// Whether a file belongs on one side of the game.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MrpackSide {
    Required,
    Optional,
    Unsupported,
}

/// Per-file environment flags in a `.mrpack` index.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct MrpackEnv {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client: Option<MrpackSide>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server: Option<MrpackSide>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct MrpackHashes {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha1: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha512: Option<String>,
}

/// A single file entry in `modrinth.index.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MrpackFile {
    /// Install path relative to the instance, e.g. `mods/sodium.jar`.
    pub path: String,
    #[serde(default)]
    pub hashes: MrpackHashes,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env: Option<MrpackEnv>,
    /// Download URLs, mirrors of one another; the first is used.
    #[serde(default)]
    pub downloads: Vec<String>,
    pub file_size: u64,
}

impl MrpackFile {
    /// A file is installed on a client unless it is explicitly `unsupported`
    /// there.
    fn for_client(&self) -> bool {
        self.env.as_ref().and_then(|env| env.client) != Some(MrpackSide::Unsupported)
    }
}

/// The parsed `modrinth.index.json` (format version 1).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MrpackIndex {
    pub format_version: u32,
    pub game: String,
    pub version_id: String,
    pub name: String,
    #[serde(default)]
    pub files: Vec<MrpackFile>,
    /// `minecraft` plus one of `fabric-loader` / `forge` / `neoforge` /
    /// `quilt-loader`. Sorted, so the manifest built from it does not reorder.
    #[serde(default)]
    pub dependencies: BTreeMap<String, String>,
}

/// A modpack, resolved as far as this crate goes: everything but the loader.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResolvedModpack {
    pub index: MrpackIndex,
    /// The index's `dependencies` — the game and loader versions.
    pub dependencies: BTreeMap<String, String>,
    /// The loader those dependencies ask for.
    pub loader: LoaderSpec,
    /// One artifact per client-side file (mods, resource packs, …).
    pub files: Vec<Artifact>,
    /// The `.mrpack` itself, with its overrides unpacked into the instance.
    pub overrides: Artifact,
}

/// Map a `.mrpack`'s `dependencies` to the loader it runs on.
///
/// - `fabric-loader` → Fabric, with the Minecraft version beside it
/// - `forge`         → Forge, as one `<minecraft>-<forge>` build id
/// - `neoforge`      → NeoForge, whose build id says nothing of Minecraft
/// - none of them    → vanilla
///
/// Quilt is refused: opys has no Quilt loader.
pub fn loader_spec(dependencies: &BTreeMap<String, String>) -> Result<LoaderSpec, ModrinthError> {
    let minecraft = dependencies
        .get("minecraft")
        .filter(|v| !v.is_empty())
        .ok_or(ModrinthError::NoMinecraft)?;
    let dependency = |name: &str| dependencies.get(name).filter(|v| !v.is_empty());

    if let Some(fabric_loader) = dependency("fabric-loader") {
        return Ok(LoaderSpec::Fabric {
            minecraft: minecraft.clone(),
            fabric_loader: fabric_loader.clone(),
        });
    }
    if let Some(forge) = dependency("forge") {
        return Ok(LoaderSpec::forge(minecraft, forge));
    }
    if let Some(neoforge) = dependency("neoforge") {
        return Ok(LoaderSpec::Neoforge {
            version: neoforge.clone(),
        });
    }
    if dependency("quilt-loader").is_some() {
        return Err(ModrinthError::Quilt);
    }
    Ok(LoaderSpec::Vanilla {
        minecraft: minecraft.clone(),
    })
}

#[derive(Deserialize)]
pub(crate) struct PackVersionWire {
    #[serde(default)]
    files: Vec<PackVersionFileWire>,
}

#[derive(Deserialize)]
pub(crate) struct PackVersionFileWire {
    url: String,
    filename: String,
    #[serde(default)]
    primary: bool,
}

/// The `.mrpack`'s own URL: the reference itself, or the pack file of the
/// version it names — the primary one if there are several.
fn mrpack_url(reference: &str, api_base: &str) -> Result<String, ModrinthError> {
    let id = match parse_modpack_ref(reference)? {
        ModpackRef::Url(url) => return Ok(url.to_owned()),
        ModpackRef::Version(id) => id,
    };
    let version: PackVersionWire = get_json(&format!("{api_base}/version/{id}"), &[])?;
    let packs = || {
        version
            .files
            .iter()
            .filter(|f| f.filename.ends_with(".mrpack"))
    };
    packs()
        .find(|f| f.primary)
        .or_else(|| packs().next())
        .map(|f| f.url.clone())
        .ok_or_else(|| ModrinthError::NotAModpack(id.to_owned()))
}

/// Resolve a Modrinth modpack into its client-side files, the artifact that
/// installs its overrides, and the loader it asks for.
///
/// The `.mrpack` is downloaded here, once, to read its index. The runtime
/// downloads it again at install time, as the overrides artifact's source.
pub fn resolve_modrinth_modpack(
    reference: &str,
    api_base: &str,
) -> Result<ResolvedModpack, ModrinthError> {
    let url = mrpack_url(reference, api_base)?;
    let response = get_bytes(&url, &[])?;
    if !response.ok() {
        return Err(ModrinthError::DownloadStatus {
            status: response.status,
            url,
        });
    }

    let archive = PackArchive::new(".mrpack archive", url, response.body);
    let index: MrpackIndex = serde_json::from_slice(&archive.entry("modrinth.index.json")?)?;
    let loader = loader_spec(&index.dependencies)?;

    let files = index
        .files
        .iter()
        .filter(|file| file.for_client())
        .map(|file| {
            let url = file
                .downloads
                .first()
                .ok_or_else(|| ModrinthError::NoDownload(file.path.clone()))?;
            Ok(Artifact {
                path: format!("${{game_directory}}/{}", file.path),
                source: Source::Url { url: url.clone() },
                size: Some(file.file_size),
                rules: Vec::new(),
                integrity: file
                    .hashes
                    .sha1
                    .as_ref()
                    .map(|sha1| Integrity::One(HashEntry::Sha1 { sha1: sha1.clone() })),
                discovery: None,
                metadata: None,
                extract: None,
            })
        })
        .collect::<Result<Vec<_>, ModrinthError>>()?;

    Ok(ResolvedModpack {
        dependencies: index.dependencies.clone(),
        loader,
        files,
        // `overrides/` ships to every side; `client-overrides/` is the
        // client's alone, and goes second so it wins where both carry a file.
        overrides: archive.overrides(
            "${root}/cache/modrinth-modpack.mrpack",
            &["overrides", "client-overrides"],
        ),
        index,
    })
}
