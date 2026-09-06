use indexmap::IndexMap;
use opys_mojang_rules::{OsOptions, RuleError};
use serde::{Deserialize, Serialize};

use crate::val::{resolve_valset, Valset};
use crate::valdefs::{resolve_val_defs, ValDefs};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "LaunchWire", into = "LaunchWire")]
pub struct Launch {
    pub command: String,
    pub workdir: String,
    pub args: Valset,
    pub envs: ValDefs,
}

/// `Val` and `ValDef` carry their own wire conversions, so the fallible half
/// of decoding happens while these fields deserialize — leaving `Launch`
/// itself an infallible reshape of present/absent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct LaunchWire {
    command: String,
    workdir: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    args: Option<Valset>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    envs: Option<ValDefs>,
}

impl From<LaunchWire> for Launch {
    fn from(raw: LaunchWire) -> Self {
        Launch {
            command: raw.command,
            workdir: raw.workdir,
            args: raw.args.unwrap_or_default(),
            envs: raw.envs.unwrap_or_default(),
        }
    }
}

impl From<Launch> for LaunchWire {
    /// `args` and `envs` are always emitted, empty or not.
    fn from(launch: Launch) -> Self {
        LaunchWire {
            command: launch.command,
            workdir: launch.workdir,
            args: Some(launch.args),
            envs: Some(launch.envs),
        }
    }
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
