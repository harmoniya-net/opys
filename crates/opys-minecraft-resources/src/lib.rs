//! `opys-minecraft-resources`: what a pack installs beside the game, kept
//! in one file.
//!
//! ```toml
//! [dirs]
//! kubejs = "${game_directory}/kubejs"
//!
//! [common.mods]
//! lithium = "modrinth:lithium@mc1.21.1-0.15.4-fabric"
//! geckolib = "modrinth:geckolib@4.9.3#fabric"
//!
//! [client.mods]
//! sodium = "modrinth:sodium@mc1.21.1-0.8.13-fabric"
//! journeymap = { source = "curseforge:journeymap@8923666", metadata = { optional = true } }
//!
//! [server.kubejs]
//! scripts = "file:kubejs/"
//! ```
//!
//! A table is a side and, in it, a directory: one of the five every pack
//! has, or one the file names in `[dirs]` with where it is. A build is of
//! one side and takes the common table with it.
//!
//! A key is the name its file is installed by, and its value is where the
//! file is: a Modrinth project and a version of it, a CurseForge file, a
//! link, a GitHub or GitLab file, or with `file:` a file or a folder on the
//! author's disk, which is carried in the bundle. There is no entry for
//! "the newest", because then the file would not say what the pack is.
//! [`parse_source`] and [`parse_resources`] read, purely.
//! [`resolve_resources`] asks, and the clients it asks through are
//! `opys-modrinth`'s, `opys-curseforge`'s and `opys-links`'s: nothing here
//! knows an API.
//!
//! Build-time only.

mod entry;
mod error;
mod file;
mod resolve;

use std::path::PathBuf;

use opys_core::{Artifact, Integrity, Source};
use opys_dev::{BuildArtifact, Contribution, PluginOutput};
use opys_links::LinkOptions;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub use entry::{parse_source, Entry, EntrySource, GitHubAsset, GitLabFile};
pub use error::ResourcesError;
pub use file::{
    parse_resources, read_resources, Listed, ResourceFile, Section, Side, BUILT_IN_DIRS,
};
pub use resolve::{resolve_resources, ResolvedResource, ResourceSource};

/// The plugin's name.
pub const PLUGIN_NAME: &str = "resources";

/// What the `resources` plugin is given.
///
/// The tables themselves and not a path to them: a config may have read
/// them from a file, written them out, or changed what it read. So where
/// they came from is said beside them, as `base`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourcesOptions {
    /// Which side this build is of.
    pub side: Side,
    /// What the pack lists.
    pub resources: ResourceFile,
    /// The directory a `file:` entry is relative to.
    pub base: PathBuf,
    /// Tokens and API bases, as `links` takes them.
    #[serde(flatten)]
    pub links: LinkOptions,
}

/// Each resolved file as an artifact, in the directory it was listed under
/// as `file` places that directory for `side`.
pub fn resource_artifacts(
    files: &[ResolvedResource],
    file: &ResourceFile,
    side: Side,
) -> Vec<BuildArtifact> {
    files
        .iter()
        .map(|found| {
            let path = format!("{}/{}", file.dir_path(&found.dir, side), found.path);
            let metadata = found.metadata.clone().map(Value::Object);
            match &found.source {
                ResourceSource::File { file } => {
                    BuildArtifact::file(&path, file).with_metadata(metadata.as_ref())
                }
                ResourceSource::Url { url } => Artifact {
                    path,
                    source: Source::Url { url: url.clone() },
                    size: Some(found.size),
                    rules: Vec::new(),
                    integrity: found.integrity.clone().map(Integrity::One),
                    metadata,
                    extract: None,
                    once: false,
                }
                .into(),
            }
        })
        .collect()
}

/// Run the plugin: resolve one side of what it was given, place the files.
pub fn build_resources(options: &ResourcesOptions) -> Result<PluginOutput, ResourcesError> {
    let file = &options.resources;
    let files = resolve_resources(file, options.side, &options.base, &options.links)?;
    Ok(PluginOutput {
        name: PLUGIN_NAME.to_owned(),
        contribution: Contribution {
            artifacts: resource_artifacts(&files, file, options.side),
            ..Contribution::default()
        },
    })
}
