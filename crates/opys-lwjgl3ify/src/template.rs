//! The `lwjgl3ify` plugin: a published version document, mapped, plus the mod
//! jars it cannot name.

use opys_bundle::Blobs;
use opys_core::{Artifact, ConditionalVal, Launch, Val, ValDefs};
use opys_dev::github::GITHUB_API_BASE;
use opys_dev::http::get_json;
use opys_dev::{BuildArtifact, Contribution, LaunchFragment, PluginOutput};
use opys_minecraft_vanilla::{add_libraries, resolve_client_template, ExtraLibrary};
use opys_mojang::Client;
use serde::{Deserialize, Serialize};

use crate::error::Lwjgl3ifyError;
use crate::index::{resolve_lwjgl3ify_version, DEFAULT_LWJGL3IFY_INDEX};
use crate::mods::{fetch_mod_jar, fetch_unimixins, Unimixins, DEFAULT_LWJGL3IFY_REPO};

/// The name this plugin claims in the plugin map.
pub const PLUGIN_NAME: &str = "lwjgl3ify";

/// What to resolve.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Lwjgl3ifyOptions {
    /// A Minecraft version (`1.7.10`), an alias (`1.7.10-latest`), or a full
    /// lwjgl3ify release tag (`3.0.37`).
    pub version: String,
    /// Document index base URL. `None` is [`DEFAULT_LWJGL3IFY_INDEX`].
    pub source: Option<String>,
    /// GitHub repo the mod jar is released from. `None` is
    /// [`DEFAULT_LWJGL3IFY_REPO`].
    pub repo: Option<String>,
    /// GitHub token, for a higher rate limit while looking the mod jars up.
    pub token: Option<String>,
    /// GitHub API base. `None` is the public API; a GitHub Enterprise host, a
    /// mirror, or the seam the tests point at a loopback server.
    pub api_base: Option<String>,
    /// UniMixins, which lwjgl3ify cannot load without.
    pub unimixins: Unimixins,
    /// Libraries to run with beside the version's own, written the way a
    /// version JSON writes one; they go ahead of everything on the classpath.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub libraries: Vec<ExtraLibrary>,
}

/// Everything an lwjgl3ify release contributes to a manifest — the game
/// included, since its document is the whole version.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lwjgl3ifyTemplate {
    /// The client jar, the assets, every library the document lists, and then
    /// the jars for `mods/`.
    pub artifacts: Vec<Artifact>,
    pub vars: ValDefs,
    /// Per-OS classpath arms (also baked into `vars.classpath`), exposed so a
    /// plugin stacked on top of lwjgl3ify can rebuild it with its own libraries.
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
/// A [`Client`], not a `VersionPatch`: lwjgl3ify's document inherits from
/// nothing, and carries the 1.7.10 client and its asset index itself.
pub fn fetch_document(url: &str) -> Result<Client, Lwjgl3ifyError> {
    let raw: serde_json::Value = get_json(url, &[])?;
    Ok(Client::from_version_json(raw)?)
}

/// Resolve lwjgl3ify: pick the release, read its document, map it, then add
/// the jars that go in `mods/`.
///
/// The mod jars are not on the classpath and not in `vars` — they are files
/// the game finds for itself — so they only ever extend `artifacts`.
pub fn resolve_lwjgl3ify(options: &Lwjgl3ifyOptions) -> Result<Lwjgl3ifyTemplate, Lwjgl3ifyError> {
    let source = options.source.as_deref().unwrap_or(DEFAULT_LWJGL3IFY_INDEX);
    let release = resolve_lwjgl3ify_version(&options.version, source)?;
    let client = fetch_document(&release.document_url)?;
    let template = add_libraries(resolve_client_template(&client)?, &options.libraries)?;

    let api_base = options.api_base.as_deref().unwrap_or(GITHUB_API_BASE);
    let token = options.token.as_deref();
    let repo = options.repo.as_deref().unwrap_or(DEFAULT_LWJGL3IFY_REPO);

    let mut artifacts = template.artifacts;
    artifacts.push(fetch_mod_jar(api_base, repo, &release.lwjgl3ify, token)?);
    if let Unimixins::Install(unimixins) = &options.unimixins {
        artifacts.push(fetch_unimixins(api_base, unimixins, token)?);
    }

    Ok(Lwjgl3ifyTemplate {
        artifacts,
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
pub fn build_lwjgl3ify(options: &Lwjgl3ifyOptions) -> Result<PluginOutput, Lwjgl3ifyError> {
    let template = resolve_lwjgl3ify(options)?;
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
