//! CurseForge modpack archives.

use std::collections::HashMap;

use opys_core::Artifact;
use opys_dev::http::get_bytes;
use opys_modpack::{LoaderSpec, PackArchive};
use serde::{Deserialize, Serialize};

use crate::error::CurseForgeError;
use crate::files::{artifact, fetch_curseforge_files, CurseForgeFile};
use crate::reference::FileRef;

/// A mod loader entry in a modpack's `manifest.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModLoader {
    /// `<loader>-<version>`, e.g. `forge-47.4.20`, `fabric-0.15.11`.
    pub id: String,
    #[serde(default)]
    pub primary: bool,
}

/// A file reference in a modpack's `manifest.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManifestFile {
    #[serde(rename = "projectID")]
    pub project_id: u64,
    #[serde(rename = "fileID")]
    pub file_id: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestMinecraft {
    pub version: String,
    #[serde(default)]
    pub mod_loaders: Vec<ModLoader>,
}

/// The parsed `manifest.json` of a CurseForge modpack `.zip`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModpackManifest {
    pub minecraft: ManifestMinecraft,
    #[serde(default)]
    pub files: Vec<ManifestFile>,
    /// The directory in the archive whose contents are copied into the
    /// instance. Absent or empty means `overrides`.
    #[serde(default)]
    pub overrides: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

/// A modpack, resolved as far as this crate goes: everything but the loader.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResolvedModpack {
    pub manifest: ModpackManifest,
    /// The loader the manifest asks for.
    pub loader: LoaderSpec,
    /// One artifact per mod file, installed under `mods/`.
    pub files: Vec<Artifact>,
    /// The `.zip` itself, with its overrides unpacked into the instance.
    pub overrides: Artifact,
}

/// Map a modpack manifest to the loader it runs on.
///
/// The primary loader is used, or the first when none is marked; its id is
/// `<loader>-<version>`. Quilt is refused: opys has no Quilt loader.
pub fn loader_spec(manifest: &ModpackManifest) -> Result<LoaderSpec, CurseForgeError> {
    let minecraft = &manifest.minecraft.version;
    let loaders = &manifest.minecraft.mod_loaders;
    let primary = loaders
        .iter()
        .find(|l| l.primary)
        .or_else(|| loaders.first())
        .ok_or(CurseForgeError::NoLoader)?;

    let (loader, version) = primary.id.split_once('-').unwrap_or((&primary.id, ""));
    match loader {
        "forge" => Ok(LoaderSpec::forge(minecraft, version)),
        "fabric" => Ok(LoaderSpec::Fabric {
            minecraft: minecraft.clone(),
            fabric_loader: version.to_owned(),
        }),
        "neoforge" => Ok(LoaderSpec::Neoforge {
            version: version.to_owned(),
        }),
        "quilt" => Err(CurseForgeError::Quilt),
        _ => Err(CurseForgeError::UnknownLoader(primary.id.clone())),
    }
}

/// Resolve a CurseForge modpack into its mod files, the artifact that installs
/// its overrides, and the loader it asks for.
///
/// Three rounds with the API and one download: the pack's own file, the
/// archive (to read its manifest), then every mod the manifest names. The
/// runtime downloads the archive again at install time, as the overrides
/// artifact's source.
pub fn resolve_curseforge_modpack(
    token: &str,
    reference: &FileRef,
    api_base: &str,
) -> Result<ResolvedModpack, CurseForgeError> {
    let pack_id = reference.id()?;
    let pack = fetch_curseforge_files(token, &[pack_id], api_base)?
        .into_iter()
        .next()
        .ok_or(CurseForgeError::UnknownModpack(pack_id))?;

    let response = get_bytes(&pack.url, &[])?;
    if !response.ok() {
        return Err(CurseForgeError::DownloadStatus {
            status: response.status,
            url: pack.url,
        });
    }
    let archive = PackArchive::new("CurseForge modpack .zip", pack.url, response.body);
    let manifest: ModpackManifest = serde_json::from_slice(&archive.entry("manifest.json")?)
        .map_err(CurseForgeError::Manifest)?;
    let loader = loader_spec(&manifest)?;

    let ids: Vec<u64> = manifest.files.iter().map(|f| f.file_id).collect();
    let found: HashMap<u64, CurseForgeFile> = fetch_curseforge_files(token, &ids, api_base)?
        .into_iter()
        .map(|file| (file.file_id, file))
        .collect();

    let files = manifest
        .files
        .iter()
        .map(|entry| {
            let file = found
                .get(&entry.file_id)
                .ok_or(CurseForgeError::UnknownModpackFile {
                    file: entry.file_id,
                    project: entry.project_id,
                })?;
            Ok(artifact(
                file,
                format!("${{game_directory}}/mods/{}", file.filename),
            ))
        })
        .collect::<Result<Vec<_>, CurseForgeError>>()?;

    let directory = if manifest.overrides.is_empty() {
        "overrides"
    } else {
        &manifest.overrides
    };
    let overrides = archive.overrides("${root}/cache/curseforge-modpack.zip", &[directory]);

    Ok(ResolvedModpack {
        manifest,
        loader,
        files,
        overrides,
    })
}
