use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use opys_mojang_rules::{OsOptions, RuleError};

use crate::shorthand::ShorthandError;
use crate::val::{encode_valset, parse_valset, resolve_valset, ValWire, Valset};
use crate::valdefs::{
    encode_val_defs, parse_val_defs, resolve_val_defs, ValDefWire, ValDefs,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Launch {
    pub command: String,
    pub workdir: String,
    pub args: Valset,
    pub envs: ValDefs,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchWire {
    pub command: String,
    pub workdir: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<ValWire>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub envs: Option<IndexMap<String, ValDefWire>>,
}

pub fn decode_launch(raw: LaunchWire) -> Result<Launch, ShorthandError> {
    Ok(Launch {
        command: raw.command,
        workdir: raw.workdir,
        args: raw.args.map(parse_valset).transpose()?.unwrap_or_default(),
        envs: raw.envs.map(parse_val_defs).transpose()?.unwrap_or_default(),
    })
}

pub fn encode_launch(launch: &Launch) -> serde_json::Value {
    let mut m = serde_json::Map::new();
    m.insert("command".into(), serde_json::Value::String(launch.command.clone()));
    m.insert("workdir".into(), serde_json::Value::String(launch.workdir.clone()));
    m.insert(
        "args".into(),
        serde_json::Value::Array(encode_valset(&launch.args)),
    );
    m.insert("envs".into(), encode_val_defs(&launch.envs));
    serde_json::Value::Object(m)
}

pub fn resolved_args(
    launch: &Launch,
    os: &OsOptions,
    feats: &[String],
) -> Result<Vec<String>, RuleError> {
    resolve_valset(&launch.args, os, feats)
}

pub fn resolved_envs(
    launch: &Launch,
    os: &OsOptions,
    feats: &[String],
) -> Result<IndexMap<String, String>, RuleError> {
    resolve_val_defs(&launch.envs, os, feats)
}
