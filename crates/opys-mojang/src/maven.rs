//! Maven coordinate parsing. Mirrors `packages/mojang/lib/client/maven.ts`.

use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};

use crate::error::MojangError;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MavenCoord {
    pub group_id: String,
    pub artifact_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub classifier: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub packaging: Option<String>,
}

impl FromStr for MavenCoord {
    type Err = MojangError;

    /// Accepts 2–5 colon-separated segments. The 4-segment form is
    /// `group:artifact:version:classifier`, while the 5-segment form reorders
    /// to `group:artifact:packaging:classifier:version`.
    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let parts: Vec<&str> = value.split(':').collect();
        let (group, artifact, packaging, classifier, version) = match parts.as_slice() {
            [g, a] => (g, a, None, None, None),
            [g, a, v] => (g, a, None, None, Some(v)),
            [g, a, v, c] => (g, a, None, Some(c), Some(v)),
            [g, a, p, c, v] => (g, a, Some(p), Some(c), Some(v)),
            _ => return Err(MojangError::InvalidMaven(value.to_owned())),
        };
        let owned = |s: Option<&&str>| s.map(|v| (*v).to_owned());
        Ok(MavenCoord {
            group_id: (*group).to_owned(),
            artifact_id: (*artifact).to_owned(),
            packaging: owned(packaging),
            classifier: owned(classifier),
            version: owned(version),
        })
    }
}

impl fmt::Display for MavenCoord {
    /// Canonical string form — the inverse of [`FromStr`], except that an
    /// incomplete tail is dropped rather than rejected (see `audit/mojang.md`).
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}", self.group_id, self.artifact_id)?;
        match (&self.packaging, &self.classifier, &self.version) {
            (Some(p), Some(c), Some(v)) => write!(f, ":{p}:{c}:{v}"),
            (None, Some(c), Some(v)) => write!(f, ":{v}:{c}"),
            (None, None, Some(v)) => write!(f, ":{v}"),
            _ => Ok(()),
        }
    }
}

impl MavenCoord {
    /// A library is "native" when its classifier names a natives bundle.
    ///
    /// Deliberately `starts_with("natives")`, not `contains("native")`: the
    /// flag lands in artifact `metadata`, which is part of the frozen
    /// manifest, and `jline-native` is not a natives bundle.
    pub fn is_native(&self) -> bool {
        self.classifier
            .as_deref()
            .is_some_and(|c| c.starts_with("natives"))
    }

    /// The coordinate's path under a Maven repository root:
    /// `<group as dirs>/<artifact>/<version>/<artifact>-<version>[-<classifier>].<ext>`.
    ///
    /// `None` when the coordinate carries no version — a versionless coordinate
    /// names an artifact, not a file, so there is no path to give. Callers that
    /// require one say so in their own error; this is Maven layout, not policy.
    pub fn path(&self) -> Option<String> {
        let version = self.version.as_deref()?;
        let group = self.group_id.replace('.', "/");
        let ext = self.packaging.as_deref().unwrap_or("jar");
        let artifact = &self.artifact_id;
        let file = match self.classifier.as_deref() {
            Some(classifier) => format!("{artifact}-{version}-{classifier}.{ext}"),
            None => format!("{artifact}-{version}.{ext}"),
        };
        Some(format!("{group}/{artifact}/{version}/{file}"))
    }

    /// Compare on every field except [`version`](MavenCoord::version).
    pub fn matches_ignoring_version(&self, other: &Self) -> bool {
        self.group_id == other.group_id
            && self.artifact_id == other.artifact_id
            && self.packaging == other.packaging
            && self.classifier == other.classifier
    }
}
