//! The `dgpuj` plugin: a release's archives, and the vars that find the binary.

use opys_core::{
    Artifact, ConditionalVal, ExtractPick, ExtractRule, HashEntry, Integrity, MojangRule,
    MojangRuleset, OsArch, OsConstraint, OsName, RuleAction, Source, Val, ValDef, ValDefs,
};
use opys_dev::github::{
    fetch_github_release, pick_github_release, pin_github_asset, GitHubRelease, ReleaseSelector,
    GITHUB_API_BASE,
};
use opys_dev::{Contribution, LaunchFragment, PluginOutput};
use serde::{Deserialize, Serialize};

use crate::error::DgpujError;

/// The name this plugin claims in the plugin map.
pub const PLUGIN_NAME: &str = "dgpuj";

/// Where dgpuj's releases are published.
pub const DEFAULT_REPO: &str = "harmoniya-net/dgpuj";

/// One build target dgpuj publishes a release archive for.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DgpujPlatform {
    pub os: OsName,
    pub arch: OsArch,
    /// Rust target triple, as it appears in the asset's name.
    pub target: String,
    /// The archive's container: `tar.gz` or `zip`.
    pub ext: String,
    /// The binary's name inside the archive and on disk: `dgpuj` or `dgpuj.exe`.
    pub bin: String,
}

impl DgpujPlatform {
    fn new(os: OsName, arch: OsArch, target: &str) -> Self {
        let windows = os == OsName::Windows;
        DgpujPlatform {
            os,
            arch,
            target: target.to_owned(),
            // An archive rather than a bare binary because a manifest has no
            // way to mark a file executable; unpacking a tarball keeps the bit.
            ext: if windows { "zip" } else { "tar.gz" }.to_owned(),
            bin: if windows { "dgpuj.exe" } else { "dgpuj" }.to_owned(),
        }
    }

    /// `dgpuj-<target>.<ext>`.
    fn asset(&self) -> String {
        format!("dgpuj-{}.{}", self.target, self.ext)
    }
}

/// dgpuj's published targets — Windows, Linux and macOS, on x86_64 and aarch64
/// where each exists.
pub fn default_platforms() -> Vec<DgpujPlatform> {
    vec![
        DgpujPlatform::new(OsName::Windows, OsArch::X86_64, "x86_64-pc-windows-msvc"),
        DgpujPlatform::new(OsName::Windows, OsArch::Aarch64, "aarch64-pc-windows-msvc"),
        DgpujPlatform::new(OsName::Linux, OsArch::X86_64, "x86_64-unknown-linux-gnu"),
        DgpujPlatform::new(OsName::Osx, OsArch::Aarch64, "aarch64-apple-darwin"),
        DgpujPlatform::new(OsName::Osx, OsArch::X86_64, "x86_64-apple-darwin"),
    ]
}

/// What to resolve.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DgpujOptions {
    /// `latest`, `prerelease`, or an exact tag (`v0.3.0`). `None` is `latest`.
    pub version: Option<String>,
    /// The targets to provision. `None` is [`default_platforms`].
    pub platforms: Option<Vec<DgpujPlatform>>,
    /// Source repo `owner/name`. `None` is [`DEFAULT_REPO`].
    pub repo: Option<String>,
    /// GitHub token, for a higher rate limit.
    pub token: Option<String>,
    /// GitHub API base. `None` is the public API.
    pub api_base: Option<String>,
}

/// What dgpuj contributes to a manifest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DgpujTemplate {
    /// One archive per target, each scoped to its OS and architecture and
    /// unpacking the binary.
    pub artifacts: Vec<Artifact>,
    /// `dgpuj_dir`, and `dgpuj_bin` per OS.
    pub vars: ValDefs,
    /// The release that was resolved.
    pub release: GitHubRelease,
}

fn allow_os(os: OsName) -> MojangRule {
    MojangRule::Os {
        action: RuleAction::Allow,
        os: OsConstraint {
            name: Some(os),
            ..Default::default()
        },
    }
}

fn os_arch_ruleset(os: OsName, arch: OsArch) -> MojangRuleset {
    vec![
        allow_os(os),
        MojangRule::Os {
            action: RuleAction::Allow,
            os: OsConstraint {
                arch: Some(arch),
                ..Default::default()
            },
        },
    ]
}

/// Resolve a dgpuj release into its artifacts and vars.
///
/// Each target's archive downloads into `${dgpuj_dir}` and unpacks the single
/// binary beside it; only the one matching the launching machine installs.
/// `dgpuj_bin` points at that binary, so a config wires
/// `command: ({ dgpuj }) => dgpuj.bin`.
pub fn resolve_dgpuj(options: &DgpujOptions) -> Result<DgpujTemplate, DgpujError> {
    let api = options.api_base.as_deref().unwrap_or(GITHUB_API_BASE);
    let repo = options.repo.as_deref().unwrap_or(DEFAULT_REPO);
    let token = options.token.as_deref();
    let platforms = options.platforms.clone().unwrap_or_else(default_platforms);

    let release = match options.version.as_deref() {
        None | Some("latest") => {
            pick_github_release(api, repo, &ReleaseSelector::Latest, token, None)?
        }
        Some("prerelease") => {
            pick_github_release(api, repo, &ReleaseSelector::Prerelease, token, None)?
        }
        Some(tag) => fetch_github_release(api, repo, tag, token)?,
    };

    let artifacts = platforms
        .iter()
        .map(|platform| {
            let name = platform.asset();
            let asset = release
                .assets
                .iter()
                .find(|a| a.name == name)
                .ok_or_else(|| DgpujError::NoAsset {
                    asset: name.clone(),
                    tag: release.tag_name.clone(),
                    available: if release.assets.is_empty() {
                        "(none)".to_owned()
                    } else {
                        release
                            .assets
                            .iter()
                            .map(|a| a.name.as_str())
                            .collect::<Vec<_>>()
                            .join(", ")
                    },
                })?;
            // GitHub's digest where it computed one; otherwise the archive is
            // read here and hashed, so it never ships unverified.
            let pinned = pin_github_asset(asset)?;
            Ok(Artifact {
                path: format!("${{dgpuj_dir}}/{name}"),
                source: Source::Url {
                    url: asset.browser_download_url.clone(),
                },
                size: Some(pinned.size),
                rules: os_arch_ruleset(platform.os, platform.arch),
                integrity: Some(Integrity::One(HashEntry::Sha256 {
                    sha256: pinned.sha256,
                })),
                metadata: None,
                extract: Some(vec![ExtractRule::Pick(ExtractPick {
                    file: platform.bin.clone(),
                    into: format!("${{dgpuj_dir}}/{}", platform.bin),
                })]),
            })
        })
        .collect::<Result<Vec<_>, DgpujError>>()?;

    // `dgpuj_bin` varies by OS only — both architectures of an OS unpack to
    // the same path — so there is one arm per OS, in the order first seen.
    let mut arms: Vec<ConditionalVal> = Vec::new();
    let mut seen: Vec<OsName> = Vec::new();
    for platform in &platforms {
        if seen.contains(&platform.os) {
            continue;
        }
        seen.push(platform.os);
        arms.push(ConditionalVal {
            value: format!("${{dgpuj_dir}}/{}", platform.bin),
            rules: vec![allow_os(platform.os)],
        });
    }

    let vars: ValDefs = [
        (
            "dgpuj_dir".to_owned(),
            ValDef::Flat("${root}/dgpuj".to_owned()),
        ),
        ("dgpuj_bin".to_owned(), ValDef::Arms(arms)),
    ]
    .into_iter()
    .collect();

    Ok(DgpujTemplate {
        artifacts,
        vars,
        release,
    })
}

/// What [`build_dgpuj`] hands back: the contribution to merge, and the release
/// it was resolved from — which the contribution does not carry, and the
/// host's log line names.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DgpujBuild {
    pub output: PluginOutput,
    pub release: GitHubRelease,
}

/// A resolved template as a ready-to-merge contribution, with two launch
/// groups: `bin`, the launcher itself, and `home`, which tells it where the
/// JVM is — `${java_home}`, the var `opys-java` owns. A config that locates
/// the JVM some other way simply leaves `home` out of its args.
pub fn build_dgpuj(options: &DgpujOptions) -> Result<DgpujBuild, DgpujError> {
    let template = resolve_dgpuj(options)?;
    Ok(DgpujBuild {
        release: template.release,
        output: PluginOutput {
            name: PLUGIN_NAME.to_owned(),
            contribution: Contribution {
                artifacts: template.artifacts,
                // Every artifact here is a download; none travels with the manifest.
                blobs: Default::default(),
                vars: template.vars,
                launch: [
                    (
                        "bin".to_owned(),
                        LaunchFragment::Text("${dgpuj_bin}".to_owned()),
                    ),
                    (
                        "home".to_owned(),
                        LaunchFragment::One(Val {
                            rules: Vec::new(),
                            value: vec!["--dgpuj-home".to_owned(), "${java_home}".to_owned()],
                        }),
                    ),
                ]
                .into_iter()
                .collect(),
                envs: Default::default(),
            },
        },
    })
}
