//! Vendor resolver for Azul Zulu builds of OpenJDK.
//!
//! Azul publishes a public metadata API at `https://api.azul.com/metadata/v1/`.
//! Each platform (os × arch) is queried separately against `/zulu/packages/`
//! with a fixed filter set (see [`zulu_query`]) — glibc (not musl) on Linux,
//! non-CRaC, no bundled JavaFX, GA/CA only — requesting `sha256_hash`/`size`
//! inline via `include_fields` so no second per-binary request is needed.
//!
//! Results are sorted here by `java_version` rather than trusted to come back
//! pre-sorted; a major-only input additionally anchors every platform on the
//! version most of them agree on (see [`pick_anchor`]), same as Temurin —
//! per-platform queries can independently resolve to a different latest patch
//! when a build hasn't rolled out everywhere yet.

use opys_core::OsName;
use opys_dev::http;
use serde::Deserialize;

use crate::error::JavaError;
use crate::platforms::{fan_out, platforms_or_default, Platform, SupportedArch};
use crate::url::encode_uri_component;
use crate::vendor::{pick_anchor, VendorBinary, VendorRelease};

pub const ZULU_BASE: &str = "https://api.azul.com/metadata/v1";
const API_NAME: &str = "Azul";

/// `linux-glibc` (not the bare `linux`, which mixes in musl builds) — musl
/// targets Alpine-style distros and isn't in scope for this resolver.
fn zulu_os(os: OsName) -> &'static str {
    match os {
        OsName::Linux => "linux-glibc",
        OsName::Osx => "macos",
        OsName::Windows => "windows",
    }
}

fn zulu_arch(arch: SupportedArch) -> &'static str {
    match arch {
        SupportedArch::X86_64 => "x64",
        SupportedArch::Aarch64 => "aarch64",
    }
}

fn archive_type(os: OsName) -> &'static str {
    match os {
        OsName::Windows => "zip",
        _ => "tar.gz",
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ResolveZuluOptions {
    /// Override the platform set. `None` → linux/mac/windows × x64+aarch64.
    pub platforms: Option<Vec<Platform>>,
    /// Override the Azul Metadata API base URL.
    pub api_base: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ZuluPackage {
    name: String,
    download_url: String,
    size: u64,
    sha256_hash: String,
    java_version: Vec<u64>,
    #[serde(default)]
    distro_version: Vec<u64>,
}

/// The version input needs no vendor-specific spelling here — Azul takes both
/// a bare major and a full version in the same `java_version` parameter.
fn zulu_query(platform: Platform, version: &str) -> String {
    let java_version = encode_uri_component(version);
    let os = zulu_os(platform.os);
    let arch = zulu_arch(platform.arch);
    let archive_type = archive_type(platform.os);
    format!(
        "java_version={java_version}&os={os}&arch={arch}&archive_type={archive_type}\
         &java_package_type=jdk&javafx_bundled=false&crac_supported=false\
         &release_status=ga&page_size=10\
         &availability_types=CA&include_fields=sha256_hash&include_fields=size"
    )
}

/// Descending compare on a `[major, minor, patch, …]` version tuple.
fn compare_versions_desc(a: &[u64], b: &[u64]) -> std::cmp::Ordering {
    let len = a.len().max(b.len());
    for i in 0..len {
        let (a, b) = (
            a.get(i).copied().unwrap_or(0),
            b.get(i).copied().unwrap_or(0),
        );
        if a != b {
            return b.cmp(&a);
        }
    }
    std::cmp::Ordering::Equal
}

fn version_key(version: &[u64]) -> String {
    version
        .iter()
        .map(u64::to_string)
        .collect::<Vec<_>>()
        .join(".")
}

/// One platform's candidate list, newest first. `None` when Azul has nothing.
struct Candidates {
    platform: Platform,
    packages: Vec<ZuluPackage>,
}

fn fetch_platform(
    api_base: &str,
    platform: Platform,
    version: &str,
) -> Result<Option<Candidates>, JavaError> {
    let url = format!(
        "{api_base}/zulu/packages/?{}",
        zulu_query(platform, version)
    );
    let os = zulu_os(platform.os);
    let arch = zulu_arch(platform.arch);

    let res = http::get(&url, &[("Accept", "application/json")])?;
    if res.status == 404 {
        return Ok(None);
    }
    if !res.ok() {
        return Err(JavaError::Api {
            vendor: API_NAME,
            status: res.status,
            os,
            arch,
        });
    }

    let mut packages: Vec<ZuluPackage> =
        serde_json::from_str(&res.body).map_err(|source| JavaError::Malformed {
            vendor: API_NAME,
            os,
            arch,
            source,
        })?;
    if packages.is_empty() {
        return Ok(None);
    }
    packages.sort_by(|a, b| compare_versions_desc(&a.java_version, &b.java_version));
    Ok(Some(Candidates { platform, packages }))
}

/// Resolve a Zulu release across all requested platforms, anchored so every
/// platform lands on the same `java_version`.
pub fn resolve_zulu(
    version: &str,
    options: &ResolveZuluOptions,
) -> Result<VendorRelease, JavaError> {
    let api_base = options.api_base.as_deref().unwrap_or(ZULU_BASE);
    let platforms = platforms_or_default(options.platforms.as_deref());
    // No vendor-specific spelling to derive: Azul's `java_version` takes a
    // bare major and a full version alike, so the input goes through as-is.
    let trimmed = version.trim();

    let with_results: Vec<Candidates> = fan_out(platforms, |platform| {
        fetch_platform(api_base, platform, trimmed)
    })?;

    if with_results.is_empty() {
        return Err(JavaError::NoBinaries {
            vendor: "Zulu",
            version: version.to_owned(),
        });
    }

    let anchor = pick_anchor(&with_results, |c| version_key(&c.packages[0].java_version));

    let matched: Vec<(Platform, &ZuluPackage)> = with_results
        .iter()
        .filter_map(|c| {
            c.packages
                .iter()
                .find(|pkg| version_key(&pkg.java_version) == anchor)
                .map(|pkg| (c.platform, pkg))
        })
        .collect();

    let binaries: Vec<VendorBinary> = matched
        .iter()
        .map(|(platform, pkg)| VendorBinary {
            platform: *platform,
            filename: pkg.name.clone(),
            url: pkg.download_url.clone(),
            size: pkg.size,
            sha256: Some(pkg.sha256_hash.clone()),
            discovery: None,
        })
        .collect();

    let first = matched[0].1;
    Ok(VendorRelease {
        label: format!("Zulu {} (JDK {anchor})", version_key(&first.distro_version)),
        major: first.java_version[0] as u32,
        binaries,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sorts_newest_version_first() {
        let mut versions = [vec![21, 0, 4], vec![21, 0, 11], vec![21, 0, 9]];
        versions.sort_by(|a, b| compare_versions_desc(a, b));
        assert_eq!(versions[0], vec![21, 0, 11]);
    }

    #[test]
    fn treats_a_missing_component_as_zero() {
        assert_eq!(
            compare_versions_desc(&[21, 0], &[21, 0, 1]),
            std::cmp::Ordering::Greater
        );
        assert_eq!(
            compare_versions_desc(&[21], &[21, 0, 0]),
            std::cmp::Ordering::Equal
        );
    }

    #[test]
    fn query_names_the_vendor_spelling_of_os_arch_and_archive() {
        let q = zulu_query(
            Platform {
                os: OsName::Linux,
                arch: SupportedArch::Aarch64,
            },
            "21",
        );
        assert!(q.contains("os=linux-glibc"), "{q}");
        assert!(q.contains("arch=aarch64"), "{q}");
        assert!(q.contains("archive_type=tar.gz"), "{q}");
        assert!(q.contains("java_version=21"), "{q}");
    }

    #[test]
    fn windows_asks_for_a_zip() {
        let q = zulu_query(
            Platform {
                os: OsName::Windows,
                arch: SupportedArch::X86_64,
            },
            "21",
        );
        assert!(q.contains("archive_type=zip"), "{q}");
    }
}
