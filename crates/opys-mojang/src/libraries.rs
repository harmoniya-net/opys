//! Version-JSON `libraries`.

use std::collections::HashMap;
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
/// A newtype because the wire shape and the domain shape differ in length:
/// one wire entry expands into a main artifact plus one entry per declared
/// native classifier. Serialises as a plain array.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "Vec<LibraryWire>")]
pub struct Libraries(Vec<Library>);

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
    classifiers: HashMap<String, Artifact>,
}

#[derive(Deserialize)]
struct LibraryWire {
    downloads: DownloadsWire,
    name: String,
    #[serde(default)]
    rules: MojangRuleset,
    #[serde(default)]
    natives: HashMap<String, String>,
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
