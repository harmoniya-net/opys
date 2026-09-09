//! The `fabric` plugin: a Fabric launcher profile layered onto vanilla.

use std::collections::HashSet;

use opys_core::{Artifact, ConditionalVal, Launch, Val, ValDef, ValDefs};
use opys_dev::{Contribution, LaunchFragment, PluginOutput};
use opys_minecraft_vanilla::{
    build_launch, fetch_client, inherited_classpath, resolve_client_template, superseded,
    ClasspathEntry, MinecraftTemplate,
};
use opys_mojang::Client;
use serde::{Deserialize, Serialize};

use crate::error::FabricError;
use crate::profile::{fetch_profile, library_artifact, FabricProfile};
use crate::resolver::{resolve_fabric_version, DEFAULT_FABRIC_META};

/// The name this plugin claims in the plugin map.
pub const PLUGIN_NAME: &str = "fabric";

/// What to resolve.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct FabricOptions {
    /// Minecraft (game) version, e.g. `1.21.4`.
    pub version: String,
    /// Fabric loader version, e.g. `0.16.10`. `None` takes the latest stable
    /// loader build targeting `version`.
    pub loader: Option<String>,
    /// Fabric Meta base URL. `None` is [`DEFAULT_FABRIC_META`].
    pub source: Option<String>,
    /// Overrides the canonical Mojang version-manifest URL — a mirror, or the
    /// seam the tests point at a loopback server.
    pub manifest_base: Option<String>,
}

/// Everything a Fabric profile plus its vanilla base contributes to a manifest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FabricTemplate {
    /// Vanilla artifacts followed by the loader's own libraries.
    pub artifacts: Vec<Artifact>,
    pub vars: ValDefs,
    /// Per-OS classpath arms (also baked into `vars.classpath`), exposed so a
    /// plugin stacked on top of Fabric can rebuild it with its own libraries.
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

/// Resolve Fabric: pick the loader build, read its profile, fetch the vanilla
/// version it inherits from, then fold the two together.
pub fn resolve_fabric(options: &FabricOptions) -> Result<FabricTemplate, FabricError> {
    let meta = options.source.as_deref().unwrap_or(DEFAULT_FABRIC_META);
    let release = resolve_fabric_version(&options.version, meta, options.loader.as_deref())?;
    let profile = fetch_profile(&release.profile_url)?;

    let (_, client) = fetch_client(
        Some(&profile.inherits_from),
        options.manifest_base.as_deref(),
    )?;
    let vanilla = resolve_client_template(&client)?;

    profile_to_template(&profile, &client, &vanilla)
}

/// The pure half: a profile, the vanilla version JSON it inherits from, and
/// that version's already-mapped template, in; a Fabric template out.
///
/// Split out for the same reason vanilla's `client_to_template` is: nothing
/// here touches the network, so the fold that actually defines Fabric — its
/// libraries appended to the classpath, its argument delta merged onto
/// vanilla's — is testable without a server.
pub fn profile_to_template(
    profile: &FabricProfile,
    client: &Client,
    vanilla: &MinecraftTemplate,
) -> Result<FabricTemplate, FabricError> {
    let libs: Vec<(Artifact, ClasspathEntry)> = profile
        .libraries
        .iter()
        .map(library_artifact)
        .collect::<Result<_, _>>()?;

    // A profile is an `inheritsFrom` patch, so its libraries go ahead of the
    // base version's, and a base library it supersedes drops out entirely —
    // Fabric ships its own ASM build and means it to be the only one.
    let patch: Vec<ClasspathEntry> = libs.iter().map(|(_, entry)| entry.clone()).collect();
    let base: Vec<ClasspathEntry> = client.libraries.iter().map(ClasspathEntry::of).collect();
    let classpath = inherited_classpath(&patch, &base, "${version_dir}/client.jar")?;

    let merged = client.args.merge(&profile.arguments);
    let parts = build_launch(&profile.main_class, &merged.game, &merged.jvm);

    let mut vars = vanilla.vars.clone();
    vars.insert("classpath".to_owned(), ValDef::Arms(classpath.clone()));

    // The download set follows the classpath: a superseded base library is no
    // longer on `-cp`, so fetching it would be work spent on a file nothing
    // opens.
    let dropped: HashSet<String> = superseded(&patch, &base).into_iter().collect();
    let mut artifacts: Vec<Artifact> = vanilla
        .artifacts
        .iter()
        .filter(|a| !dropped.contains(&a.path))
        .cloned()
        .collect();
    artifacts.extend(libs.into_iter().map(|(artifact, _)| artifact));

    Ok(FabricTemplate {
        artifacts,
        vars,
        classpath,
        launch: parts.launch,
        jvm_args: parts.jvm_args,
        main_class: parts.main_class,
        game_args: parts.game_args,
    })
}

/// A resolved template as a ready-to-merge contribution.
pub fn build_fabric(options: &FabricOptions) -> Result<PluginOutput, FabricError> {
    let template = resolve_fabric(options)?;
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
