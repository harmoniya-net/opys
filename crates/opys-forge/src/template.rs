//! The `forge` plugin: a published Forge version document, folded onto vanilla.

use opys_core::{Artifact, ConditionalVal, Launch, Val, ValDefs};
use opys_dev::http::get_json;
use opys_dev::{Contribution, LaunchFragment, PluginOutput};
use opys_minecraft_vanilla::{fetch_client, patch_to_template, resolve_client_template};
use opys_mojang::VersionPatch;
use serde::{Deserialize, Serialize};

use crate::error::ForgeError;
use crate::index::{resolve_forge_version, DEFAULT_FORGE_INDEX};

/// The name this plugin claims in the plugin map.
pub const PLUGIN_NAME: &str = "forge";

/// What to resolve.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ForgeOptions {
    /// A Minecraft version (`1.20.1`), an alias (`1.20.1-recommended`), or a
    /// full Forge build id (`1.20.1-47.4.10`).
    pub version: String,
    /// Document index base URL. `None` is [`DEFAULT_FORGE_INDEX`].
    pub source: Option<String>,
    /// Overrides the canonical Mojang version-manifest URL — a mirror, or the
    /// seam the tests point at a loopback server.
    pub manifest_base: Option<String>,
}

/// Everything a Forge build plus its vanilla base contributes to a manifest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgeTemplate {
    /// Vanilla artifacts followed by Forge's own libraries.
    pub artifacts: Vec<Artifact>,
    pub vars: ValDefs,
    /// Per-OS classpath arms (also baked into `vars.classpath`), exposed so a
    /// plugin stacked on top of Forge can rebuild it with its own libraries.
    pub classpath: Vec<ConditionalVal>,
    /// Assembled launch — drop straight into `manifest.launch`.
    pub launch: Launch,
    /// JVM args alone, for composition (e.g. interleaving an auth `-javaagent`).
    pub jvm_args: Vec<Val>,
    /// Main class wrapped as a `Val` so it spreads into a `Valset`.
    pub main_class: Val,
    /// Game args alone, for composition.
    pub game_args: Vec<Val>,
}

/// Fetch and parse one build's version document.
pub fn fetch_document(url: &str) -> Result<VersionPatch, ForgeError> {
    Ok(get_json(url, &[])?)
}

/// Resolve Forge: pick the build, read its document, fetch the vanilla version
/// it inherits from, then fold the two together.
///
/// There is no era to branch on. Every Forge build — the 1.1 jar mods, the
/// 1.7-era LaunchWrapper releases, the 1.13+ processor installs — is published
/// as the same kind of document, and the differences between them are already
/// spelled out inside it: which libraries to add, which class to launch, which
/// properties ForgeWrapper needs. That is the whole reason the documents
/// exist, and it is what makes this the same shape as `opys-fabric`.
pub fn resolve_forge(options: &ForgeOptions) -> Result<ForgeTemplate, ForgeError> {
    let source = options.source.as_deref().unwrap_or(DEFAULT_FORGE_INDEX);
    let release = resolve_forge_version(&options.version, source)?;
    let patch = fetch_document(&release.document_url)?;

    let (_, client) = fetch_client(Some(&patch.inherits_from), options.manifest_base.as_deref())?;
    let vanilla = resolve_client_template(&client)?;
    let folded = patch_to_template(&patch, &client, &vanilla)?;

    Ok(ForgeTemplate {
        artifacts: folded.artifacts,
        vars: folded.vars,
        classpath: folded.classpath,
        launch: folded.launch,
        jvm_args: folded.jvm_args,
        main_class: folded.main_class,
        game_args: folded.game_args,
    })
}

/// A resolved template as a ready-to-merge contribution.
pub fn build_forge(options: &ForgeOptions) -> Result<PluginOutput, ForgeError> {
    let template = resolve_forge(options)?;
    Ok(PluginOutput {
        name: PLUGIN_NAME.to_owned(),
        contribution: Contribution {
            artifacts: template.artifacts,
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
