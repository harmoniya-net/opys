//! Vendor resolver for GraalVM Community Edition, built from the
//! `graalvm/graalvm-ce-builds` GitHub releases (the Apache-2.0 community
//! builds — distinct from Oracle GraalVM's own no-fee distribution, which
//! this resolver does not target).
//!
//! Releases are tagged `jdk-<version>` for the standard GA cadence. A
//! major-only input picks the newest `jdk-<major>.*` tag; a full input matches
//! a tag exactly (verbatim if already tag-shaped, e.g. an explicit
//! `graal-25.2.4` "Innovation" tag — the newer, non-LTS cadence this resolver
//! otherwise doesn't recognise, since its version numbering doesn't reliably
//! embed the JDK major and it isn't needed to support "give me the latest
//! GraalVM for JDK `<major>`").
//!
//! The archive's internal top-level directory embeds a build identifier that
//! isn't derivable from release metadata (verified by inspecting real
//! archives: tag `jdk-21.0.2` extracts to
//! `graalvm-community-openjdk-21.0.2+13.1/`) — the template sidesteps this
//! entirely by extracting with a glob-strip rule that drops the archive's
//! leading path segment regardless of its name, so this resolver never needs
//! to know it.
//!
//! Checksums: GitHub computes an inline `digest` for assets uploaded since
//! 2024; older releases lack it. Every GraalVM CE archive ships a sibling
//! `<archive>.sha256` asset (just the bare hex hash, verified against a real
//! release), so for a binary without an inline digest that file is read here,
//! at build time, and its hash pinned like any other. A manifest never ships a
//! JDK it cannot verify, and never asks the installing machine to find out.

use opys_core::OsName;
use opys_dev::github::{
    github_asset_sha256, pick_github_release, GitHubAsset, GitHubRelease, ReleaseSelector,
    GITHUB_API_BASE,
};

use opys_dev::http::get;
use serde::Deserialize;

use crate::error::JavaError;
use crate::platforms::{platforms_or_default, Platform, SupportedArch};
use crate::vendor::{VendorBinary, VendorRelease};
use crate::version::{is_bare_major, leading_digits};

const REPO: &str = "graalvm/graalvm-ce-builds";

fn graalvm_os(os: OsName) -> &'static str {
    match os {
        OsName::Linux => "linux",
        OsName::Osx => "macos",
        OsName::Windows => "windows",
    }
}

fn graalvm_arch(arch: SupportedArch) -> &'static str {
    match arch {
        SupportedArch::X86_64 => "x64",
        SupportedArch::Aarch64 => "aarch64",
    }
}

fn archive_ext(os: OsName) -> &'static str {
    match os {
        OsName::Windows => "zip",
        _ => "tar.gz",
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ResolveGraalvmOptions {
    /// Override the platform set. `None` → linux/mac/windows × x64+aarch64.
    pub platforms: Option<Vec<Platform>>,
    /// GitHub token, for higher rate limits.
    pub token: Option<String>,
    /// Override the GitHub API base URL — a Enterprise host or a mirror.
    pub api_base: Option<String>,
}

/// A major-only input selects the newest matching release; anything else
/// names a tag.
#[derive(Debug, Clone, PartialEq, Eq)]
enum TagInput {
    Major(String),
    Tag(String),
}

fn normalize_input(input: &str) -> TagInput {
    let v = input.trim();
    if is_bare_major(v) {
        return TagInput::Major(v.to_owned());
    }
    // A bare dotted version (`21.0.2`) names the standard `jdk-` cadence;
    // anything already tag-shaped (`jdk-21.0.2`, or an explicit `graal-25.2.4`
    // Innovation tag) is used verbatim.
    TagInput::Tag(if leading_digits(v) > 0 {
        format!("jdk-{v}")
    } else {
        v.to_owned()
    })
}

fn find_asset(assets: &[GitHubAsset], platform: Platform) -> Option<&GitHubAsset> {
    let suffix = format!(
        "_{}-{}_bin.{}",
        graalvm_os(platform.os),
        graalvm_arch(platform.arch),
        archive_ext(platform.os)
    );
    assets.iter().find(|a| a.name.ends_with(&suffix))
}

fn parse_major(tag: &str) -> Result<u32, JavaError> {
    let unsupported = || JavaError::UnsupportedTag {
        tag: tag.to_owned(),
    };
    let rest = tag.strip_prefix("jdk-").ok_or_else(unsupported)?;
    let digits = leading_digits(rest);
    if digits == 0 || !rest[digits..].starts_with('.') {
        return Err(unsupported());
    }
    rest[..digits].parse().map_err(|_| unsupported())
}

/// The first run of 64 hex digits in `text` — a `.sha256` file is the bare
/// hash, or `sha256sum`'s `<hash>  <name>`.
fn first_sha256(text: &str) -> Option<String> {
    text.split(|c: char| !c.is_ascii_hexdigit())
        .find(|run| run.len() == 64)
        .map(str::to_ascii_lowercase)
}

/// The sha256 of `asset`, read from its sibling `<archive>.sha256` asset.
/// For the releases GitHub computed no inline digest for.
fn sidecar_sha256(release: &GitHubRelease, asset: &GitHubAsset) -> Result<String, JavaError> {
    let missing = || JavaError::NoChecksum {
        asset: asset.name.clone(),
    };
    let name = format!("{}.sha256", asset.name);
    let sidecar = release
        .assets
        .iter()
        .find(|a| a.name == name)
        .ok_or_else(missing)?;
    let response = get(&sidecar.browser_download_url, &[])?;
    if !response.ok() {
        return Err(missing());
    }
    first_sha256(&response.body).ok_or_else(missing)
}

/// Resolve a GraalVM CE release across all requested platforms. Every
/// platform's asset comes from the same GitHub release (one tag = one release
/// for every platform at once), so unlike Temurin/Zulu there's no
/// per-platform version skew to anchor against — and one listing request
/// serves them all, so there is nothing to fan out.
pub fn resolve_graalvm(
    version: &str,
    options: &ResolveGraalvmOptions,
) -> Result<VendorRelease, JavaError> {
    let api_base = options.api_base.as_deref().unwrap_or(GITHUB_API_BASE);
    let platforms = platforms_or_default(options.platforms.as_deref());
    let parsed = normalize_input(version);

    let release = match &parsed {
        TagInput::Tag(tag) => pick_github_release(
            api_base,
            REPO,
            &ReleaseSelector::Tag(tag),
            options.token.as_deref(),
            None,
        ),
        TagInput::Major(major) => {
            let prefix = format!("jdk-{major}.");
            let keep = |r: &GitHubRelease| r.tag_name.starts_with(&prefix);
            pick_github_release(
                api_base,
                REPO,
                &ReleaseSelector::Latest,
                options.token.as_deref(),
                Some(&keep),
            )
        }
    }?;

    let binaries: Vec<VendorBinary> = platforms
        .iter()
        .filter_map(|&platform| find_asset(&release.assets, platform).map(|a| (platform, a)))
        .map(|(platform, asset)| {
            let sha256 = match github_asset_sha256(asset) {
                Some(inline) => inline.to_owned(),
                None => sidecar_sha256(&release, asset)?,
            };
            Ok(VendorBinary {
                platform,
                filename: asset.name.clone(),
                url: asset.browser_download_url.clone(),
                size: asset.size,
                sha256: Some(sha256),
            })
        })
        .collect::<Result<_, JavaError>>()?;

    if binaries.is_empty() {
        return Err(JavaError::NoBinaries {
            vendor: "GraalVM CE",
            version: version.to_owned(),
        });
    }

    let short = release
        .tag_name
        .strip_prefix("jdk-")
        .unwrap_or(&release.tag_name);
    Ok(VendorRelease {
        label: format!("GraalVM CE {short}"),
        major: parse_major(&release.tag_name)?,
        binaries,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asset(name: &str) -> GitHubAsset {
        GitHubAsset {
            name: name.to_owned(),
            size: 1,
            browser_download_url: format!("https://example.invalid/{name}"),
            digest: None,
        }
    }

    #[test]
    fn classifies_the_three_input_shapes() {
        assert_eq!(normalize_input("21"), TagInput::Major("21".into()));
        assert_eq!(
            normalize_input("21.0.2"),
            TagInput::Tag("jdk-21.0.2".into())
        );
        assert_eq!(
            normalize_input("jdk-21.0.2"),
            TagInput::Tag("jdk-21.0.2".into())
        );
        assert_eq!(
            normalize_input("graal-25.2.4"),
            TagInput::Tag("graal-25.2.4".into())
        );
    }

    #[test]
    fn matches_an_asset_by_its_platform_suffix() {
        let assets = [
            asset("graalvm-community-jdk-21.0.2_linux-x64_bin.tar.gz"),
            asset("graalvm-community-jdk-21.0.2_windows-x64_bin.zip"),
            asset("graalvm-community-jdk-21.0.2_macos-aarch64_bin.tar.gz"),
        ];
        let found = find_asset(
            &assets,
            Platform {
                os: OsName::Osx,
                arch: SupportedArch::Aarch64,
            },
        );
        assert_eq!(
            found.map(|a| a.name.as_str()),
            Some(assets[2].name.as_str())
        );
    }

    #[test]
    fn ignores_the_sha256_sidecar_asset() {
        // The sidecar shares the archive's name plus `.sha256`, so a
        // suffix match must not pick it up as the archive.
        let assets = [
            asset("graalvm-community-jdk-21.0.2_linux-x64_bin.tar.gz.sha256"),
            asset("graalvm-community-jdk-21.0.2_linux-x64_bin.tar.gz"),
        ];
        let found = find_asset(
            &assets,
            Platform {
                os: OsName::Linux,
                arch: SupportedArch::X86_64,
            },
        );
        assert_eq!(
            found.map(|a| a.name.as_str()),
            Some(assets[1].name.as_str())
        );
    }

    #[test]
    fn reads_the_major_off_a_standard_tag() {
        assert_eq!(parse_major("jdk-21.0.2").unwrap(), 21);
        assert_eq!(parse_major("jdk-8.0.1").unwrap(), 8);
    }

    #[test]
    fn rejects_a_tag_outside_the_standard_cadence() {
        for tag in ["graal-25.2.4", "jdk-21", "vm-23.0.0", "jdk-"] {
            assert!(parse_major(tag).is_err(), "{tag} should be unsupported");
        }
    }
}
