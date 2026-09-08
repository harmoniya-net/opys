//! Version-JSON `libraries`.

use std::collections::BTreeMap;
use std::ops::Deref;

use opys_mojang_rules::{MojangRule, MojangRuleset, OsConstraint, OsName, RuleAction};
use serde::{Deserialize, Serialize};

use crate::error::MojangError;
use crate::maven::MavenCoord;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Artifact {
    pub path: String,
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Library {
    pub name: MavenCoord,
    /// Mojang OS/feature rules — the `opys-mojang-rules` format.
    pub rules: MojangRuleset,
    pub artifact: Artifact,
    pub native: bool,
}

/// The `libraries` array, flattened.
///
/// A newtype because the version-JSON shape and the domain shape differ in
/// length: one JSON entry expands into a main artifact plus one entry per
/// declared native classifier. De/serialises as a plain array of [`Library`],
/// symmetrically; reading the version-JSON spelling is
/// [`Libraries::from_version_json`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Libraries(Vec<Library>);

impl Libraries {
    /// Read (and flatten) the `libraries` array of a version JSON.
    pub fn from_version_json(raw: serde_json::Value) -> Result<Self, MojangError> {
        serde_json::from_value::<Vec<LibraryWire>>(raw)?.try_into()
    }
}

impl Deref for Libraries {
    type Target = [Library];
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl IntoIterator for Libraries {
    type Item = Library;
    type IntoIter = std::vec::IntoIter<Library>;
    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

impl From<Libraries> for Vec<Library> {
    fn from(libs: Libraries) -> Self {
        libs.0
    }
}

#[derive(Deserialize)]
struct DownloadsWire {
    #[serde(default)]
    artifact: Option<Artifact>,
    #[serde(default)]
    classifiers: BTreeMap<String, Artifact>,
}

#[derive(Deserialize)]
pub(crate) struct LibraryWire {
    downloads: DownloadsWire,
    name: String,
    #[serde(default)]
    rules: MojangRuleset,
    /// Ordered, not hashed: each entry expands into an artifact, and the
    /// order they expand in is the order they appear in the manifest. A
    /// `HashMap` here made an `opys.json` differ between two builds of the
    /// same version.
    #[serde(default)]
    natives: BTreeMap<String, String>,
}

fn os_name(raw: &str) -> Result<OsName, MojangError> {
    match raw {
        "linux" => Ok(OsName::Linux),
        "windows" => Ok(OsName::Windows),
        "osx" => Ok(OsName::Osx),
        _ => Err(MojangError::InvalidOsName(raw.to_owned())),
    }
}

impl TryFrom<Vec<LibraryWire>> for Libraries {
    type Error = MojangError;

    fn try_from(wires: Vec<LibraryWire>) -> Result<Self, Self::Error> {
        let mut out = Vec::new();
        for wire in wires {
            let name: MavenCoord = wire.name.parse()?;

            if let Some(artifact) = wire.downloads.artifact {
                out.push(Library {
                    native: name.is_native(),
                    name: name.clone(),
                    rules: wire.rules.clone(),
                    artifact,
                });
            }

            for (os, classifier_key) in &wire.natives {
                // Only the legacy `ca.weblite:java-objc-bridge` classifier
                // uses the `{arch}` placeholder, and opys targets 64-bit
                // exclusively. `replacen(.., 1)` matches JS `String.replace`
                // with a string pattern, which substitutes the first
                // occurrence only.
                let key = classifier_key.replacen("{arch}", "64", 1);
                let Some(artifact) = wire.downloads.classifiers.get(&key) else {
                    continue;
                };
                out.push(Library {
                    name: name.clone(),
                    rules: vec![MojangRule::Os {
                        action: RuleAction::Allow,
                        os: OsConstraint {
                            name: Some(os_name(os)?),
                            ..Default::default()
                        },
                    }],
                    artifact: artifact.clone(),
                    native: true,
                });
            }
        }
        Ok(Self(out))
    }
}
