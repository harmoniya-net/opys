//! Vendor resolver for Eclipse Temurin (the Adoptium project's OpenJDK
//! builds).
//!
//! Adoptium publishes a public asset API at `https://api.adoptium.net/v3/`.
//! Two endpoints, chosen by the shape of the version input:
//!
//!   - Major-only (`"21"`, `"17"`) → `/feature_releases/<major>/ga` (latest GA)
//!   - Full version → `/release_name/<vendor>/<release-name>` (exact, pinned
//!     build). Adoptium release names differ by line — Java 8 is
//!     `jdk8u<update>-b<build>` (no hyphen), Java 9+ is `jdk-<version>`. A
//!     full input is accepted bare (`"8u492-b09"`, `"21.0.13+11"`) or as a
//!     complete release name (`"jdk8u492-b09"`, `"jdk-21.0.13+11"`).
//!
//! Each platform (os × arch) is queried separately with `image_type=jdk` and
//! `jvm_impl=hotspot`. Releases that don't ship a binary for a given platform
//! are soft-skipped — the resolved release only carries the platforms that
//! have a real binary.

use opys_core::OsName;
use opys_dev::http;
use serde::Deserialize;

use crate::error::JavaError;
use crate::platforms::{fan_out, platforms_or_default, Platform, SupportedArch};
use crate::url::encode_uri_component;
use crate::vendor::{pick_anchor, VendorBinary, VendorRelease};
use crate::version::{is_bare_major, leading_digits, VersionInput};

pub const ADOPTIUM_BASE: &str = "https://api.adoptium.net/v3";
const VENDOR: &str = "eclipse";
const API_NAME: &str = "Adoptium";

fn adoptium_os(os: OsName) -> &'static str {
    match os {
        OsName::Linux => "linux",
        OsName::Osx => "mac",
        OsName::Windows => "windows",
    }
}

fn adoptium_arch(arch: SupportedArch) -> &'static str {
    match arch {
        SupportedArch::X86_64 => "x64",
        SupportedArch::Aarch64 => "aarch64",
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ResolveTemurinOptions {
    /// Override the platform set. `None` → linux/mac/windows × x64+aarch64.
    pub platforms: Option<Vec<Platform>>,
    /// Override the Adoptium API base URL.
    pub api_base: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AdoptiumPackage {
    checksum: String,
    link: String,
    name: String,
    size: u64,
}

#[derive(Debug, Deserialize)]
struct AdoptiumBinary {
    architecture: String,
    os: String,
    image_type: String,
    package: AdoptiumPackage,
}

#[derive(Debug, Deserialize)]
struct AdoptiumVersionData {
    major: u32,
}

#[derive(Debug, Deserialize)]
struct AdoptiumRelease {
    release_name: String,
    #[serde(default)]
    binaries: Vec<AdoptiumBinary>,
    version_data: AdoptiumVersionData,
}

/// `feature_releases` answers with a list, `release_name` with a bare object.
/// List first — an object would otherwise never be reached.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum AdoptiumBody {
    Many(Vec<AdoptiumRelease>),
    One(Box<AdoptiumRelease>),
}

/// Classify a version input and spell a full one as an Adoptium release name.
fn normalize_input(input: &str) -> VersionInput {
    let trimmed = input.trim();
    let v = trimmed.strip_suffix("-LTS").unwrap_or(trimmed);
    if is_bare_major(v) {
        return VersionInput::Major(v.to_owned());
    }
    // A value already carrying the `jdk` prefix is a complete release name; a
    // bare version is prefixed to match — `jdk` (no hyphen) for the Java 8
    // `8u…-b…` form, `jdk-` for the Java 9+ `<major>.<minor>.<patch>+<build>`.
    if v.starts_with("jdk") {
        return VersionInput::Full(v.to_owned());
    }
    let digits = leading_digits(v);
    let is_java8_update_form = digits > 0 && v[digits..].starts_with('u');
    VersionInput::Full(if is_java8_update_form {
        format!("jdk{v}")
    } else {
        format!("jdk-{v}")
    })
}

/// `heap_size=normal` excludes the `large` (huge-pages) variant;
/// `vendor=eclipse` pins the distribution to Temurin. Every value is one of
/// our own constants, so none of it needs escaping.
fn adoptium_query(platform: Platform) -> String {
    let arch = adoptium_arch(platform.arch);
    let os = adoptium_os(platform.os);
    format!(
        "image_type=jdk&architecture={arch}&os={os}&jvm_impl=hotspot\
         &heap_size=normal&vendor={VENDOR}"
    )
}

/// One platform's answer, flattened to what the template needs.
struct Matched {
    platform: Platform,
    release_name: String,
    major: u32,
    package: AdoptiumPackage,
}

fn fetch_platform(
    api_base: &str,
    platform: Platform,
    version: &VersionInput,
) -> Result<Option<Matched>, JavaError> {
    let query = adoptium_query(platform);
    let path = match version {
        VersionInput::Major(major) => {
            format!("/assets/feature_releases/{major}/ga?{query}&page_size=1&sort_order=DESC")
        }
        VersionInput::Full(name) => {
            let name = encode_uri_component(name);
            format!("/assets/release_name/{VENDOR}/{name}?{query}")
        }
    };

    let os = adoptium_os(platform.os);
    let arch = adoptium_arch(platform.arch);
    let res = http::get(
        &format!("{api_base}{path}"),
        &[("Accept", "application/json")],
    )?;
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

    let body: AdoptiumBody =
        serde_json::from_str(&res.body).map_err(|source| JavaError::Malformed {
            vendor: API_NAME,
            os,
            arch,
            source,
        })?;
    let release = match body {
        AdoptiumBody::Many(list) => match list.into_iter().next() {
            Some(release) => release,
            None => return Ok(None),
        },
        AdoptiumBody::One(release) => *release,
    };

    let matched = release
        .binaries
        .into_iter()
        .find(|b| b.architecture == arch && b.os == os && b.image_type == "jdk");
    Ok(matched.map(|binary| Matched {
        platform,
        release_name: release.release_name,
        major: release.version_data.major,
        package: binary.package,
    }))
}

/// Resolve a Temurin release across all requested platforms, anchored so
/// every platform lands on the same release (per-platform queries can
/// independently resolve to a different latest-GA when a build hasn't rolled
/// out to every platform yet — mismatched platforms are dropped).
pub fn resolve_temurin(
    version: &str,
    options: &ResolveTemurinOptions,
) -> Result<VendorRelease, JavaError> {
    let api_base = options.api_base.as_deref().unwrap_or(ADOPTIUM_BASE);
    let platforms = platforms_or_default(options.platforms.as_deref());
    let parsed = normalize_input(version);

    let matched: Vec<Matched> = fan_out(platforms, |platform| {
        fetch_platform(api_base, platform, &parsed)
    })?;

    if matched.is_empty() {
        return Err(JavaError::NoBinaries {
            vendor: "Temurin",
            version: version.to_owned(),
        });
    }

    let release_name = pick_anchor(&matched, |m| m.release_name.clone());
    let consistent: Vec<&Matched> = matched
        .iter()
        .filter(|m| m.release_name == release_name)
        .collect();

    let binaries: Vec<VendorBinary> = consistent
        .iter()
        .map(|m| VendorBinary {
            platform: m.platform,
            filename: m.package.name.clone(),
            url: m.package.link.clone(),
            size: m.package.size,
            sha256: Some(m.package.checksum.clone()),
            discovery: None,
        })
        .collect();

    // `jdk-21.0.13+11` → `21.0.13+11`, `jdk8u492-b09` → `8u492-b09`.
    let short = release_name
        .strip_prefix("jdk-")
        .or_else(|| release_name.strip_prefix("jdk"))
        .unwrap_or(&release_name);

    Ok(VendorRelease {
        label: format!("Temurin {short}"),
        major: consistent[0].major,
        binaries,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_a_bare_major() {
        assert_eq!(normalize_input("21"), VersionInput::Major("21".into()));
        assert_eq!(normalize_input("  17  "), VersionInput::Major("17".into()));
        assert_eq!(normalize_input("21-LTS"), VersionInput::Major("21".into()));
    }

    #[test]
    fn prefixes_a_bare_full_version_per_java_line() {
        assert_eq!(
            normalize_input("21.0.13+11"),
            VersionInput::Full("jdk-21.0.13+11".into())
        );
        assert_eq!(
            normalize_input("8u492-b09"),
            VersionInput::Full("jdk8u492-b09".into())
        );
    }

    #[test]
    fn passes_a_complete_release_name_through() {
        assert_eq!(
            normalize_input("jdk-21.0.13+11"),
            VersionInput::Full("jdk-21.0.13+11".into())
        );
        assert_eq!(
            normalize_input("jdk8u492-b09"),
            VersionInput::Full("jdk8u492-b09".into())
        );
    }

    #[test]
    fn query_names_the_vendor_spelling_of_os_and_arch() {
        let q = adoptium_query(Platform {
            os: OsName::Osx,
            arch: SupportedArch::X86_64,
        });
        assert!(q.contains("os=mac"), "{q}");
        assert!(q.contains("architecture=x64"), "{q}");
        assert!(q.contains("vendor=eclipse"), "{q}");
    }
}
