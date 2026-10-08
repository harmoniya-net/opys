//! The `minecraft` plugin: vanilla client, libraries and assets.

use std::collections::HashSet;

use indexmap::IndexMap;
use opys_core::{allow_os_ruleset, Artifact, Blobs, ConditionalVal, Launch, Val, ValDef, ValDefs};
use opys_dev::{Contribution, LaunchFragment, PluginOutput};
use opys_mojang::{AssetManifest, Client, VersionPatch};
use opys_mojang_rules::OsName;

use crate::error::MinecraftError;
use crate::extra::{resolve_libraries, with_libraries, ExtraLibrary};
use crate::fetch::{fetch_asset_manifest, fetch_client};
use crate::mappers::{
    asset_directory, build_launch, classpath_entries, classpath_of, inherited_entries,
    map_asset_index, map_asset_objects, map_client_jar, map_libraries, superseded, ClasspathEntry,
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
    /// Libraries to run with beside the version's own; see [`ExtraLibrary`].
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub libraries: Vec<ExtraLibrary>,
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
    /// The classpath as the list it was joined from, in order. What lets a
    /// config's own libraries go ahead of it and supersede what they replace.
    #[serde(default)]
    pub entries: Vec<ClasspathEntry>,
    /// Where the blobs among `artifacts` are kept. Empty unless a config
    /// added a library from its own disk: a version's files are downloads.
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

/// Resolve vanilla Minecraft.
pub fn resolve_minecraft(options: &MinecraftOptions) -> Result<MinecraftTemplate, MinecraftError> {
    let (_, client) = fetch_client(options.version.as_deref(), options.manifest_base.as_deref())?;
    add_libraries(resolve_client_template(&client)?, &options.libraries)
}

/// Put a config's own libraries on a resolved template. Every loader ends
/// here, so "an additional library" means one thing across the family. With
/// none to add it does nothing, and reaches for nothing.
pub fn add_libraries(
    template: MinecraftTemplate,
    libraries: &[ExtraLibrary],
) -> Result<MinecraftTemplate, MinecraftError> {
    if libraries.is_empty() {
        return Ok(template);
    }
    Ok(with_libraries(template, resolve_libraries(libraries)?)?)
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
    artifacts.extend(map_asset_objects(assets, &client.asset_index.id));

    let libraries: Vec<ClasspathEntry> = client.libraries.iter().map(ClasspathEntry::of).collect();
    let entries = classpath_entries(&libraries, "${version_dir}/client.jar");
    let classpath = classpath_of(&entries)?;

    let mut vars: ValDefs = IndexMap::new();
    let mut flat = |key: &str, value: &str| {
        vars.insert(key.to_owned(), ValDef::Flat(value.to_owned()));
    };
    flat("root", ".");
    flat("launcher_name", "opys");
    // What the game logs and sends as its launcher's version: opys's own, as
    // released. It said `0.1` for as long as nobody looked.
    flat("launcher_version", env!("CARGO_PKG_VERSION"));
    flat("version_type", &client.metadata.kind);
    flat("version_name", &client.id);
    flat("game_directory", "${root}/");
    flat("assets_root", "${root}/assets");
    flat(
        "game_assets",
        &asset_directory(assets, &client.asset_index.id),
    );
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
        entries,
        blobs: Blobs::new(),
        launch: parts.launch,
        jvm_args: parts.jvm_args,
        main_class: parts.main_class,
        game_args: parts.game_args,
    })
}

/// Fold an `inheritsFrom` document onto the base version it names.
///
/// The shared half of the loader family. Forge, NeoForge, Cleanroom and
/// lwjgl3ify each reach a [`VersionPatch`] their own way — a published
/// document, an installer, a patched version JSON — and from there the fold is
/// identical: the patch's libraries become artifacts and go ahead of the
/// base's on the classpath, its arguments merge onto the base's, and its main
/// class replaces the base's. Doing it once is what makes a fix to the
/// ordering rule or the argument semantics land for every loader at once.
///
/// `vanilla` is the base version's already-mapped template — the caller holds
/// it, so nothing here refetches the asset manifest.
pub fn patch_to_template(
    patch: &VersionPatch,
    client: &Client,
    vanilla: &MinecraftTemplate,
) -> Result<MinecraftTemplate, opys_mojang_rules::RuleError> {
    let patch_entries: Vec<ClasspathEntry> =
        patch.libraries.iter().map(ClasspathEntry::of).collect();
    let base_entries: Vec<ClasspathEntry> =
        client.libraries.iter().map(ClasspathEntry::of).collect();
    let entries = inherited_entries(&patch_entries, &base_entries, "${version_dir}/client.jar");
    let classpath = classpath_of(&entries)?;

    let mut vars = vanilla.vars.clone();
    vars.insert("classpath".to_owned(), ValDef::Arms(classpath.clone()));

    // The download set has to agree with the classpath. A base library the
    // patch supersedes is gone from `-cp`, so fetching and verifying it would
    // be work spent on a file nothing opens.
    let dropped: HashSet<String> =
        superseded(&patch_entries, &base_entries, "${version_dir}/client.jar")
            .into_iter()
            .collect();
    let mut artifacts: Vec<Artifact> = vanilla
        .artifacts
        .iter()
        .filter(|a| !dropped.contains(&a.path))
        .cloned()
        .collect();
    artifacts.extend(map_libraries(&patch.libraries));

    let merged = patch.merge_args(&client.args);
    let parts = build_launch(&patch.main_class, &merged.game, &merged.jvm);

    Ok(MinecraftTemplate {
        artifacts,
        vars,
        classpath,
        entries,
        blobs: vanilla.blobs.clone(),
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
            // Empty unless the config added a library from its own disk.
            blobs: template.blobs,
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
