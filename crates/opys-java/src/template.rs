//! The vendor-agnostic half: turn a resolved [`VendorRelease`] into the
//! artifacts and vars a manifest needs.

use indexmap::IndexMap;
use opys_core::{
    Artifact, ConditionalVal, ExtractRule, ExtractScan, HashEntry, Integrity, OsConstraint, OsName,
    Rule, RuleAction, Ruleset, Source, ValDef, ValDefs,
};
use serde::{Deserialize, Serialize};

use crate::error::JavaError;
use crate::graalvm::{resolve_graalvm, ResolveGraalvmOptions};
use crate::platforms::{mac_home_suffix, Platform, SupportedArch};
use crate::temurin::{resolve_temurin, ResolveTemurinOptions};
use crate::vendor::VendorRelease;
use crate::zulu::{resolve_zulu, ResolveZuluOptions};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JavaVendor {
    #[default]
    Temurin,
    Zulu,
    Graalvm,
}

/// What a config author asks for. Mirrors `@opys/java`'s `JavaOptions` field
/// for field, including the fields only some vendors read — the plugin takes
/// one options object and dispatches, so the JS surface and this one stay a
/// single shape across the binding.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct JavaOptions {
    /// JDK version. A bare major (`"21"`) resolves to the latest GA for that
    /// major; anything else is a vendor-specific exact build.
    pub version: String,
    /// Distribution to fetch from. Defaults to Temurin (Eclipse Adoptium).
    pub vendor: Option<JavaVendor>,
    /// Override the platform set. `None` covers linux/osx/windows × x86_64+aarch64.
    pub platforms: Option<Vec<Platform>>,
    /// API base URL override.
    pub api_base: Option<String>,
    /// GitHub token for higher rate limits — `graalvm` only.
    pub token: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct JavaTemplate {
    /// Per-platform JDK archives, scoped by OS+arch rules and extracted on
    /// first install.
    pub artifacts: Vec<Artifact>,
    /// `java_home` and `java_bin` per OS — spread into the loader's vars.
    pub vars: ValDefs,
    /// Resolved release metadata.
    pub release: VendorRelease,
}

fn allow_os(os: OsName) -> Rule {
    Rule::Os {
        action: RuleAction::Allow,
        os: OsConstraint {
            name: Some(os),
            ..Default::default()
        },
    }
}

fn os_arch_ruleset(os: OsName, arch: SupportedArch) -> Ruleset {
    vec![
        allow_os(os),
        Rule::Os {
            action: RuleAction::Allow,
            os: OsConstraint {
                arch: Some(arch.as_os_arch()),
                ..Default::default()
            },
        },
    ]
}

fn os_ruleset(os: OsName) -> Ruleset {
    vec![allow_os(os)]
}

fn feature_rule(action: RuleAction, name: &str, required: bool) -> Rule {
    Rule::Features {
        action,
        features: [(name.to_owned(), required)].into_iter().collect(),
    }
}

/// Windows ships both `java.exe` (console subsystem) and `javaw.exe` (windows
/// subsystem — no console). Emit two mutually-exclusive `java_bin` arms gated
/// on the `java_console` feature: `javaw.exe` by default so a launched game
/// never spawns a stray console window, and `java.exe` when `java_console` is
/// enabled at install/launch (e.g. `opys launch --feature java_console`) to
/// watch stdout/stderr. The ruleset evaluator ANDs across an arm's rules, so
/// for any feature state exactly one arm is active.
fn windows_bin_arms() -> Vec<ConditionalVal> {
    vec![
        ConditionalVal {
            value: "${java_home}/bin/javaw.exe".to_owned(),
            rules: vec![
                allow_os(OsName::Windows),
                feature_rule(RuleAction::Disallow, "java_console", true),
            ],
        },
        ConditionalVal {
            value: "${java_home}/bin/java.exe".to_owned(),
            rules: vec![
                allow_os(OsName::Windows),
                feature_rule(RuleAction::Allow, "java_console", true),
            ],
        },
    ]
}

fn resolve_release(options: &JavaOptions) -> Result<VendorRelease, JavaError> {
    match options.vendor.unwrap_or_default() {
        JavaVendor::Temurin => resolve_temurin(
            &options.version,
            &ResolveTemurinOptions {
                platforms: options.platforms.clone(),
                api_base: options.api_base.clone(),
            },
        ),
        JavaVendor::Zulu => resolve_zulu(
            &options.version,
            &ResolveZuluOptions {
                platforms: options.platforms.clone(),
                api_base: options.api_base.clone(),
            },
        ),
        JavaVendor::Graalvm => resolve_graalvm(
            &options.version,
            &ResolveGraalvmOptions {
                platforms: options.platforms.clone(),
                token: options.token.clone(),
                api_base: options.api_base.clone(),
            },
        ),
    }
}

/// Build a manifest fragment that auto-installs a JDK runtime and exposes
/// `${java_home}` + `${java_bin}`.
///
/// Each platform's archive is emitted as its own `Artifact` with an OS+arch
/// rule, so only the matching binary downloads at install time. Archives
/// extract into `${java_runtime_dir}/jdk-<major>/` with the archive's own
/// top-level directory glob-stripped regardless of what it's named — some
/// vendors' archives embed a build identifier that isn't knowable at resolve
/// time (see the `graalvm` module), so every vendor is extracted the same
/// flattened way rather than special-casing the ones whose directory name
/// happens to be predictable. On macOS, `${java_home}` includes the
/// `/Contents/Home` suffix that Mac JDK bundles use.
///
/// On Windows, `${java_bin}` defaults to `javaw.exe` (no console window);
/// enable the `java_console` feature to switch it to `java.exe` — see
/// [`windows_bin_arms`].
pub fn resolve_java(options: &JavaOptions) -> Result<JavaTemplate, JavaError> {
    Ok(java_template(resolve_release(options)?))
}

/// The vendor-agnostic half of [`resolve_java`], split out because it is
/// pure: a resolved release in, artifacts and vars out, no I/O.
pub fn java_template(release: VendorRelease) -> JavaTemplate {
    // JDK runtimes install under the `java_runtime_dir` var (default
    // `${root}/runtimes`) — override it in the config's `vars` to relocate.
    // Archives download directly into it: a sibling of, never nested inside,
    // the extract target, so no `.cache` special-casing is needed.
    let java_root = format!("${{java_runtime_dir}}/jdk-{}", release.major);

    let artifacts: Vec<Artifact> = release
        .binaries
        .iter()
        .map(|b| Artifact {
            path: format!("${{java_runtime_dir}}/{}", b.filename),
            source: Source::Url { url: b.url.clone() },
            size: Some(b.size),
            rules: os_arch_ruleset(b.platform.os, b.platform.arch),
            integrity: b.sha256.as_ref().map(|sha256| {
                Integrity::One(HashEntry::Sha256 {
                    sha256: sha256.clone(),
                })
            }),
            discovery: b.discovery.clone(),
            metadata: None,
            extract: Some(vec![ExtractRule::Scan(ExtractScan {
                matches: "*".to_owned(),
                into: java_root.clone(),
                strip: Some(vec!["*/".to_owned()]),
                includes: None,
                excludes: None,
            })]),
        })
        .collect();

    // `java_home` only varies by OS (Linux/Windows have no suffix; macOS
    // bundles add `/Contents/Home`) now that extraction always flattens the
    // archive's own top-level directory — arch never enters into it.
    let mut java_home_arms: Vec<ConditionalVal> = Vec::new();
    let mut java_bin_arms: Vec<ConditionalVal> = Vec::new();
    for os in seen_oses(&release) {
        java_home_arms.push(ConditionalVal {
            value: format!("{java_root}{}", mac_home_suffix(os)),
            rules: os_ruleset(os),
        });
        if os == OsName::Windows {
            java_bin_arms.extend(windows_bin_arms());
        } else {
            java_bin_arms.push(ConditionalVal {
                value: "${java_home}/bin/java".to_owned(),
                rules: os_ruleset(os),
            });
        }
    }

    let mut vars: ValDefs = IndexMap::new();
    vars.insert(
        "java_runtime_dir".to_owned(),
        ValDef::Flat("${root}/runtimes".to_owned()),
    );
    vars.insert("java_home".to_owned(), ValDef::Arms(java_home_arms));
    vars.insert("java_bin".to_owned(), ValDef::Arms(java_bin_arms));

    JavaTemplate {
        artifacts,
        vars,
        release,
    }
}

/// The OSes the release actually ships, in first-seen order — the arms are
/// emitted in that order, so it has to be the binaries' order, not a sort.
fn seen_oses(release: &VendorRelease) -> Vec<OsName> {
    let mut seen: Vec<OsName> = Vec::new();
    for binary in &release.binaries {
        if !seen.contains(&binary.platform.os) {
            seen.push(binary.platform.os);
        }
    }
    seen
}
