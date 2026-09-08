//! The `minecraft` plugin: vanilla client, libraries and assets.

use indexmap::IndexMap;
use opys_core::{allow_os_ruleset, Artifact, ConditionalVal, Launch, Val, ValDef, ValDefs};
use opys_dev::{Contribution, LaunchFragment, PluginOutput};
use opys_mojang::{AssetManifest, Client};
use opys_mojang_rules::OsName;

use crate::error::MinecraftError;
use crate::fetch::{fetch_asset_manifest, fetch_client};
use crate::mappers::{
    build_classpath, build_launch, map_asset_index, map_asset_objects, map_client_jar,
    map_libraries, ClasspathEntry,
};

/// The name this plugin claims in the plugin map.
pub const PLUGIN_NAME: &str = "minecraft";

/// What to resolve.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct MinecraftOptions {
    /// Version id. `None` takes the manifest's current release.
    pub version: Option<String>,
    /// Overrides the canonical version-manifest URL — the seam the tests
    /// point at a loopback server.
    pub manifest_base: Option<String>,
}

/// Everything a vanilla version JSON contributes to a manifest.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftTemplate {
    pub artifacts: Vec<Artifact>,
    pub vars: ValDefs,
    /// Per-OS classpath arms (also baked into `vars.classpath`), exposed so a
    /// loader can rebuild the classpath with its own libraries prepended.
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

/// Resolve vanilla Minecraft.
pub fn resolve_minecraft(options: &MinecraftOptions) -> Result<MinecraftTemplate, MinecraftError> {
    let (_, client) = fetch_client(options.version.as_deref(), options.manifest_base.as_deref())?;
    resolve_client_template(&client)
}

/// Fetch what a version JSON points at, then map it. The loaders' entry
/// point: each arrives holding a `Client` of its own — forge through an
/// installer, fabric through a launcher profile — and only the asset manifest
/// is still missing.
pub fn resolve_client_template(client: &Client) -> Result<MinecraftTemplate, MinecraftError> {
    let assets = fetch_asset_manifest(&client.asset_index.url)?;
    Ok(client_to_template(client, &assets)?)
}

/// The pure half: a version JSON plus its asset manifest, in; a template out.
/// Split from [`resolve_minecraft`] because every loader in the family reaches
/// this point by its own route — forge through an installer, fabric through a
/// launcher profile — and none of them should refetch what it already holds.
pub fn client_to_template(
    client: &Client,
    assets: &AssetManifest,
) -> Result<MinecraftTemplate, opys_mojang_rules::RuleError> {
    let mut artifacts = vec![map_client_jar(client)];
    artifacts.extend(map_libraries(&client.libraries));
    artifacts.push(map_asset_index(&client.asset_index));
    artifacts.extend(map_asset_objects(assets));

    let entries: Vec<ClasspathEntry> = client
        .libraries
        .iter()
        .map(|l| ClasspathEntry {
            rules: l.rules.clone(),
            artifact_path: format!("${{library_directory}}/{}", l.artifact.path),
        })
        .collect();
    let classpath = build_classpath(&entries, "${version_dir}/client.jar")?;

    let mut vars: ValDefs = IndexMap::new();
    let mut flat = |key: &str, value: &str| {
        vars.insert(key.to_owned(), ValDef::Flat(value.to_owned()));
    };
    flat("root", ".");
    flat("launcher_name", "opys");
    flat("launcher_version", "0.1");
    flat("version_type", &client.metadata.kind);
    flat("version_name", &client.id);
    flat("game_directory", "${root}/");
    flat("assets_root", "${root}/assets");
    flat("game_assets", "${assets_root}");
    flat("assets_index_name", &client.asset_index.id);
    flat("version_dir", "${root}/versions/${version_name}");
    flat("library_directory", "${root}/libraries");
    flat("natives_directory", "${version_dir}/natives");
    flat("auth_player_name", "${username}");
    flat("auth_uuid", "${uuid}");
    flat("auth_session", "${token}");
    flat("auth_access_token", "${token}");
    flat("user_type", "mojang");
    flat("user_properties", "{}");
    flat("clientid", "");

    let separator = |sep: &str, os: OsName| ConditionalVal {
        value: sep.to_owned(),
        rules: allow_os_ruleset(os),
    };
    vars.insert(
        "classpath_separator".to_owned(),
        ValDef::Arms(vec![
            separator(";", OsName::Windows),
            separator(":", OsName::Linux),
            separator(":", OsName::Osx),
        ]),
    );
    vars.insert("classpath".to_owned(), ValDef::Arms(classpath.clone()));

    let parts = build_launch(&client.main_class, &client.args.game, &client.args.jvm);

    Ok(MinecraftTemplate {
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
pub fn build_minecraft(options: &MinecraftOptions) -> Result<PluginOutput, MinecraftError> {
    let template = resolve_minecraft(options)?;
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
