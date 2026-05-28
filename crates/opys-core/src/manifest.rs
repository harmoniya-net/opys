use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use opys_mojang_rules::OsOptions;

use crate::artifact::{
    artifact_applies, decode_artifact, encode_artifact, Artifact, ArtifactWire,
};
use crate::launch::{decode_launch, encode_launch, Launch, LaunchWire};
use crate::shorthand::ShorthandError;
use crate::valdefs::{encode_val_defs, parse_val_defs, ValDefWire, ValDefs};
use crate::DecodeError;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Manifest {
    pub vars: ValDefs,
    pub launch: Option<Launch>,
    pub artifacts: Vec<Artifact>,
    pub restrict: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestWire {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vars: Option<IndexMap<String, ValDefWire>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub launch: Option<LaunchWire>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artifacts: Option<Vec<ArtifactWire>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub restrict: Option<Vec<String>>,
}

pub fn decode_manifest(raw: ManifestWire) -> Result<Manifest, ShorthandError> {
    Ok(Manifest {
        vars: raw.vars.map(parse_val_defs).transpose()?.unwrap_or_default(),
        launch: raw.launch.map(decode_launch).transpose()?,
        artifacts: raw
            .artifacts
            .map(|v| v.into_iter().map(decode_artifact).collect::<Result<_, _>>())
            .transpose()?
            .unwrap_or_default(),
        restrict: raw.restrict,
    })
}

pub fn encode_manifest(u: &Manifest) -> serde_json::Value {
    let mut m = serde_json::Map::new();
    m.insert("vars".into(), encode_val_defs(&u.vars));
    if let Some(launch) = &u.launch {
        m.insert("launch".into(), encode_launch(launch));
    }
    m.insert(
        "artifacts".into(),
        serde_json::to_value(u.artifacts.iter().map(encode_artifact).collect::<Vec<_>>()).unwrap(),
    );
    if let Some(r) = &u.restrict {
        if !r.is_empty() {
            m.insert("restrict".into(), serde_json::to_value(r).unwrap());
        }
    }
    serde_json::Value::Object(m)
}

pub fn parse_manifest(input: &str) -> Result<Manifest, DecodeError> {
    let wire: ManifestWire = serde_json::from_str(input)
        .map_err(|e| DecodeError::Manifest(format!("{e}")))?;
    decode_manifest(wire).map_err(Into::into)
}

pub fn filter_manifest(
    u: &Manifest,
    os: &OsOptions,
    feats: &[String],
) -> Result<Manifest, opys_mojang_rules::RuleError> {
    let artifacts = u
        .artifacts
        .iter()
        .filter_map(|a| match artifact_applies(a, os, feats) {
            Ok(true) => Some(Ok(a.clone())),
            Ok(false) => None,
            Err(e) => Some(Err(e)),
        })
        .collect::<Result<_, _>>()?;
    Ok(Manifest {
        artifacts,
        ..u.clone()
    })
}
