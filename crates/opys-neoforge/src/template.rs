//! The `neoforge` plugin: a published NeoForge version document, folded onto
//! vanilla.

use opys_core::{Artifact, ConditionalVal, Launch, Val, ValDefs};
use opys_dev::http::get_json;
use opys_dev::{Contribution, LaunchFragment, PluginOutput};
use opys_minecraft_vanilla::{fetch_client, patch_to_template, resolve_client_template};
use opys_mojang::VersionPatch;
use serde::{Deserialize, Serialize};

use crate::error::NeoForgeError;
use crate::index::{resolve_neoforge_version, DEFAULT_NEOFORGE_INDEX};

/// The name this plugin claims in the plugin map.
pub const PLUGIN_NAME: &str = "neoforge";

/// What to resolve.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct NeoForgeOptions {
    /// A Minecraft version (`1.21.1`), an alias (`1.21.1-recommended`), or a
    /// full NeoForge build id (`21.1.172`).
    pub version: String,
    /// Document index base URL. `None` is [`DEFAULT_NEOFORGE_INDEX`].
    pub source: Option<String>,
    /// Overrides the canonical Mojang version-manifest URL — a mirror, or the
    /// seam the tests point at a loopback server.
    pub manifest_base: Option<String>,
}

/// Everything a NeoForge build plus its vanilla base contributes to a manifest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NeoForgeTemplate {
    /// Vanilla artifacts followed by NeoForge's own libraries.
    pub artifacts: Vec<Artifact>,
    pub vars: ValDefs,
    /// Per-OS classpath arms (also baked into `vars.classpath`), exposed so a
    /// plugin stacked on top of NeoForge can rebuild it with its own libraries.
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
pub fn fetch_document(url: &str) -> Result<VersionPatch, NeoForgeError> {
    Ok(get_json(url, &[])?)
}

/// Resolve NeoForge: pick the build, read its document, fetch the vanilla
/// version it inherits from, then fold the two together.
///
/// NeoForge installs one way and one way only — the installer's processors
/// build the patched client on the machine that runs it. None of that happens
/// here: the published document names the installer as a library and hands
/// ForgeWrapper the properties it needs, so what is left at build time is the
/// same three steps Forge and Fabric take.
pub fn resolve_neoforge(options: &NeoForgeOptions) -> Result<NeoForgeTemplate, NeoForgeError> {
    let source = options.source.as_deref().unwrap_or(DEFAULT_NEOFORGE_INDEX);
    let release = resolve_neoforge_version(&options.version, source)?;
    let patch = fetch_document(&release.document_url)?;

    let (_, client) = fetch_client(Some(&patch.inherits_from), options.manifest_base.as_deref())?;
    let vanilla = resolve_client_template(&client)?;
    let folded = patch_to_template(&patch, &client, &vanilla)?;

    Ok(NeoForgeTemplate {
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
pub fn build_neoforge(options: &NeoForgeOptions) -> Result<PluginOutput, NeoForgeError> {
    let template = resolve_neoforge(options)?;
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
