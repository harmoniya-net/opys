use regex::Regex;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Platform context passed to rule evaluation. Free-form strings — these are
/// live OS detection values, not constrained by the wire schema.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OsOptions {
    pub name: String,
    pub version: String,
    pub arch: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OsName {
    Linux,
    Windows,
    Osx,
    /// Mojang has never written it; LWJGL 3 ships natives for it, and a
    /// version JSON that lists LWJGL's own classifiers names it.
    Freebsd,
}

/// The `x64`, `arm64` and `arm32` some version JSONs write, after LWJGL's
/// and netty's classifiers, are other names for an architecture here and
/// are read as it: one architecture has one spelling once decoded, and that
/// is the one a manifest is written with.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OsArch {
    #[serde(rename = "x86")]
    X86,
    #[serde(rename = "x86_64", alias = "x64")]
    X86_64,
    #[serde(rename = "arm", alias = "arm32")]
    Arm,
    #[serde(rename = "aarch64", alias = "arm64")]
    Aarch64,
    #[serde(rename = "ppc64le")]
    Ppc64le,
    #[serde(rename = "riscv64")]
    Riscv64,
    #[serde(rename = "any")]
    Any,
}

impl OsName {
    fn as_str(self) -> &'static str {
        match self {
            OsName::Linux => "linux",
            OsName::Windows => "windows",
            OsName::Osx => "osx",
            OsName::Freebsd => "freebsd",
        }
    }
}

impl OsArch {
    fn as_str(self) -> &'static str {
        match self {
            OsArch::X86 => "x86",
            OsArch::X86_64 => "x86_64",
            OsArch::Arm => "arm",
            OsArch::Aarch64 => "aarch64",
            OsArch::Ppc64le => "ppc64le",
            OsArch::Riscv64 => "riscv64",
            OsArch::Any => "any",
        }
    }
}

/// Constraint on OS as it appears in rule JSON. Every field is optional and
/// independent — present must match, absent is ignored.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct OsConstraint {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<OsName>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arch: Option<OsArch>,
}

#[derive(Debug, Error)]
pub enum RuleError {
    #[error("Invalid OS version pattern \"{pattern}\": {source}")]
    InvalidVersionRegex {
        pattern: String,
        #[source]
        source: regex::Error,
    },
}

pub fn satisfies_os(constraint: &OsConstraint, os: &OsOptions) -> Result<bool, RuleError> {
    if let Some(name) = constraint.name {
        if name.as_str() != os.name {
            return Ok(false);
        }
    }
    if let Some(arch) = constraint.arch {
        if arch.as_str() != os.arch {
            return Ok(false);
        }
    }
    if let Some(pattern) = constraint.version.as_deref() {
        let re = Regex::new(pattern).map_err(|source| RuleError::InvalidVersionRegex {
            pattern: pattern.to_owned(),
            source,
        })?;
        if !re.is_match(&os.version) {
            return Ok(false);
        }
    }
    Ok(true)
}
