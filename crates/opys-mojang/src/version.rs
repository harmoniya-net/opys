//! Version manifest (`version_manifest_v2.json`) — parsing and lookup only.
//! Fetching lives with the caller; this crate performs no I/O.

use serde::{Deserialize, Serialize};

pub const VERSION_MANIFEST_URL: &str =
    "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub url: String,
    pub time: String,
    pub release_time: String,
    pub sha1: String,
    pub compliance_level: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Latest {
    pub release: String,
    pub snapshot: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VersionManifest {
    pub latest: Latest,
    pub versions: Vec<Version>,
}

impl VersionManifest {
    pub fn find(&self, id: &str) -> Option<&Version> {
        self.versions.iter().find(|v| v.id == id)
    }

    /// The version named by `latest.release`, if the manifest lists it.
    pub fn latest_release(&self) -> Option<&Version> {
        self.find(&self.latest.release)
    }
}
