//! The `authliberty` plugin: the agent jar and the JVM arguments that load it.

use opys_core::{Artifact, HashEntry, Integrity, Source, Val};
use opys_dev::{Contribution, LaunchFragment, PluginOutput};
use serde::{Deserialize, Serialize};

use crate::error::AuthLibertyError;
use crate::resolver::{resolve_authliberty_version, AuthLibertyRelease, ResolveAuthLibertyOptions};

/// The name this plugin claims in the plugin map.
pub const PLUGIN_NAME: &str = "authliberty";

/// Replacement hosts, one per Mojang service AuthLiberty can retarget. A host
/// left out — or left empty — stays on Mojang's at runtime.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct AuthLibertyHosts {
    /// Yggdrasil auth server (`https://authserver.mojang.com`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth: Option<String>,
    /// Account services (`https://account.mojang.com`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account: Option<String>,
    /// Session and profile server (`https://sessionserver.mojang.com`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<String>,
    /// Minecraft Services API (`https://api.minecraftservices.com`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub services: Option<String>,
}

impl AuthLibertyHosts {
    /// Each configured host with the system property that carries it, in the
    /// one order the arguments are always written in.
    fn properties(&self) -> impl Iterator<Item = (&'static str, &str)> {
        [
            ("minecraft.api.auth.host", &self.auth),
            ("minecraft.api.account.host", &self.account),
            ("minecraft.api.session.host", &self.session),
            ("minecraft.api.services.host", &self.services),
        ]
        .into_iter()
        .filter_map(|(property, host)| {
            let host = host.as_deref()?;
            (!host.is_empty()).then_some((property, host))
        })
    }
}

/// What to resolve.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AuthLibertyOptions {
    /// An exact version (`0.3`), or `latest` for the channel `main` publishes
    /// to — whose hash is frozen at build time.
    pub version: String,
    /// GitLab project path. `None` is the canonical one.
    pub project: Option<String>,
    /// GitLab instance URL. `None` is `https://gitlab.com`.
    pub gitlab: Option<String>,
    /// GitLab token, for a private project or a higher rate limit.
    pub token: Option<String>,
    /// Replacement hosts, each becoming a `-Dminecraft.api.*.host` property.
    pub hosts: AuthLibertyHosts,
}

/// What AuthLiberty contributes to a manifest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthLibertyTemplate {
    /// The agent jar.
    pub artifacts: Vec<Artifact>,
    /// `-javaagent:<path>` and a `-D` per configured host. These go ahead of
    /// the loader's own JVM arguments, so the redirect is in place before any
    /// auth code runs.
    pub jvm_args: Vec<Val>,
    /// What was resolved, for logging or pinning.
    pub release: AuthLibertyRelease,
}

fn val(value: String) -> Val {
    Val {
        rules: Vec::new(),
        value: vec![value],
    }
}

/// Resolve AuthLiberty into its jar and its JVM arguments.
///
/// The jar lands at `${library_directory}/net/harmoniya/authliberty/<v>/<file>`
/// — a maven-shaped path, where the loaders keep their own bootstrap jars.
pub fn resolve_authliberty(
    options: &AuthLibertyOptions,
) -> Result<AuthLibertyTemplate, AuthLibertyError> {
    let release = resolve_authliberty_version(
        &options.version,
        &ResolveAuthLibertyOptions {
            project: options.project.clone(),
            gitlab: options.gitlab.clone(),
            token: options.token.clone(),
        },
    )?;

    let path = format!(
        "${{library_directory}}/net/harmoniya/authliberty/{}/{}",
        release.version, release.filename
    );

    let artifact = Artifact {
        path: path.clone(),
        source: Source::Url {
            url: release.url.clone(),
        },
        size: Some(release.size),
        rules: Vec::new(),
        integrity: release.sha256.as_ref().map(|sha256| {
            Integrity::One(HashEntry::Sha256 {
                sha256: sha256.clone(),
            })
        }),
        metadata: None,
        extract: None,
    };

    let jvm_args = std::iter::once(val(format!("-javaagent:{path}")))
        .chain(
            options
                .hosts
                .properties()
                .map(|(property, host)| val(format!("-D{property}={host}"))),
        )
        .collect();

    Ok(AuthLibertyTemplate {
        artifacts: vec![artifact],
        jvm_args,
        release,
    })
}

/// A resolved template as a ready-to-merge contribution. AuthLiberty exposes
/// one launch group, `jvmArgs`: it has no command and no main class of its own.
pub fn build_authliberty(options: &AuthLibertyOptions) -> Result<PluginOutput, AuthLibertyError> {
    let template = resolve_authliberty(options)?;
    Ok(PluginOutput {
        name: PLUGIN_NAME.to_owned(),
        contribution: Contribution {
            artifacts: template.artifacts.into_iter().map(Into::into).collect(),
            // Every artifact here is a download; none travels with the manifest.
            vars: Default::default(),
            launch: [(
                "jvmArgs".to_owned(),
                LaunchFragment::Many(template.jvm_args),
            )]
            .into_iter()
            .collect(),
            envs: Default::default(),
        },
    })
}
