use opys_mojang_rules::OsOptions;
use serde::{Deserialize, Serialize};

use crate::artifact::Artifact;
use crate::launch::Launch;
use crate::valdefs::ValDefs;
use crate::DecodeError;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "ManifestWire", into = "ManifestWire")]
pub struct Manifest {
    pub vars: ValDefs,
    pub launch: Option<Launch>,
    pub artifacts: Vec<Artifact>,
    pub restrict: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ManifestWire {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    vars: Option<ValDefs>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    launch: Option<Launch>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    artifacts: Option<Vec<Artifact>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    restrict: Option<Vec<String>>,
}

impl From<ManifestWire> for Manifest {
    fn from(raw: ManifestWire) -> Self {
        Manifest {
            vars: raw.vars.unwrap_or_default(),
            launch: raw.launch,
            artifacts: raw.artifacts.unwrap_or_default(),
            restrict: raw.restrict,
        }
    }
}

impl From<Manifest> for ManifestWire {
    /// `vars` and `artifacts` are always emitted; `restrict` only when it has
    /// entries, since an empty sweep list and no sweep list mean the same.
    fn from(m: Manifest) -> Self {
        ManifestWire {
            vars: Some(m.vars),
            launch: m.launch,
            artifacts: Some(m.artifacts),
            restrict: m.restrict.filter(|r| !r.is_empty()),
        }
    }
}

pub fn parse_manifest(input: &str) -> Result<Manifest, DecodeError> {
    serde_json::from_str(input).map_err(|e| DecodeError::Manifest(format!("{e}")))
}

pub fn filter_manifest(
    m: &Manifest,
    os: &OsOptions,
    feats: &[String],
) -> Result<Manifest, opys_mojang_rules::RuleError> {
    let artifacts = m
        .artifacts
        .iter()
        .filter_map(|a| match a.applies(os, feats) {
            Ok(true) => Some(Ok(a.clone())),
            Ok(false) => None,
            Err(e) => Some(Err(e)),
        })
        .collect::<Result<_, _>>()?;
    Ok(Manifest {
        artifacts,
        ..m.clone()
    })
}
