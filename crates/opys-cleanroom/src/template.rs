//! The `cleanroom` plugin: a published Cleanroom version document, mapped.

use opys_bundle::Blobs;
use opys_core::{Artifact, ConditionalVal, Launch, Val, ValDefs};
use opys_dev::http::get_json;
use opys_dev::{BuildArtifact, Contribution, LaunchFragment, PluginOutput};
use opys_minecraft_vanilla::{add_libraries, resolve_client_template, ExtraLibrary};
use opys_mojang::Client;
use serde::{Deserialize, Serialize};

use crate::error::CleanroomError;
use crate::index::{resolve_cleanroom_version, DEFAULT_CLEANROOM_INDEX};

/// The name this plugin claims in the plugin map.
pub const PLUGIN_NAME: &str = "cleanroom";

/// What to resolve.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct CleanroomOptions {
    /// A Minecraft version (`1.12.2`), an alias (`1.12.2-latest`), or a full
    /// Cleanroom release tag (`0.6.13-alpha`).
    pub version: String,
    /// Document index base URL. `None` is [`DEFAULT_CLEANROOM_INDEX`].
    pub source: Option<String>,
    /// Libraries to run with beside the version's own, written the way a
    /// version JSON writes one; they go ahead of everything on the classpath.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub libraries: Vec<ExtraLibrary>,
}

/// Everything a Cleanroom release contributes to a manifest — the game
/// included, since its document is the whole version.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanroomTemplate {
    /// The client jar, the assets, and every library the document lists.
    pub artifacts: Vec<Artifact>,
    pub vars: ValDefs,
    /// Per-OS classpath arms (also baked into `vars.classpath`), exposed so a
    /// plugin stacked on top of Cleanroom can rebuild it with its own libraries.
    pub classpath: Vec<ConditionalVal>,
    /// Where the blobs among `artifacts` are kept: empty unless the config
    /// added a library from its own disk.
    #[serde(default, skip_serializing_if = "Blobs::is_empty")]
    pub blobs: Blobs,
    /// Assembled launch — drop straight into `manifest.launch`.
    pub launch: Launch,
    /// JVM args alone, for composition (e.g. interleaving an auth `-javaagent`).
    pub jvm_args: Vec<Val>,
    /// Main class wrapped as a `Val` so it spreads into a `Valset`.
    pub main_class: Val,
    /// Game args alone, for composition.
    pub game_args: Vec<Val>,
}

/// Fetch and parse one release's version document.
///
/// A [`Client`], not a `VersionPatch`: the document inherits from nothing. It
/// carries its own client download and asset index, and its library list is
/// already the one that runs — Cleanroom's LWJGL 3 with vanilla's LWJGL 2 gone,
/// which no `inheritsFrom` merge could have expressed, since the two live under
/// different groups.
pub fn fetch_document(url: &str) -> Result<Client, CleanroomError> {
    let raw: serde_json::Value = get_json(url, &[])?;
    Ok(Client::from_version_json(raw)?)
}

/// Resolve Cleanroom: pick the release, read its document, map it.
///
/// The same two requests `opys-forge` makes, minus the third: there is no
/// vanilla version to fetch, because nothing is inherited. What is left is
/// exactly the vanilla path with a different version JSON in hand.
pub fn resolve_cleanroom(options: &CleanroomOptions) -> Result<CleanroomTemplate, CleanroomError> {
    let source = options.source.as_deref().unwrap_or(DEFAULT_CLEANROOM_INDEX);
    let release = resolve_cleanroom_version(&options.version, source)?;
    let client = fetch_document(&release.document_url)?;
    let template = add_libraries(resolve_client_template(&client)?, &options.libraries)?;

    Ok(CleanroomTemplate {
        artifacts: template.artifacts,
        vars: template.vars,
        classpath: template.classpath,
        blobs: template.blobs,
        launch: template.launch,
        jvm_args: template.jvm_args,
        main_class: template.main_class,
        game_args: template.game_args,
    })
}

/// A resolved template as a ready-to-merge contribution.
pub fn build_cleanroom(options: &CleanroomOptions) -> Result<PluginOutput, CleanroomError> {
    let template = resolve_cleanroom(options)?;
    Ok(PluginOutput {
        name: PLUGIN_NAME.to_owned(),
        contribution: Contribution {
            artifacts: BuildArtifact::carrying(template.artifacts, &template.blobs),
            vars: template.vars,
            launch: [
                (
                    "command".to_owned(),
                    LaunchFragment::Text(template.launch.command.clone()),
                ),
                (
                    "jvmArgs".to_owned(),
                    LaunchFragment::Many(template.jvm_args),
                ),
                (
                    "mainClass".to_owned(),
                    LaunchFragment::One(template.main_class),
                ),
                (
                    "gameArgs".to_owned(),
                    LaunchFragment::Many(template.game_args),
                ),
            ]
            .into_iter()
            .collect(),
            envs: Default::default(),
        },
    })
}
