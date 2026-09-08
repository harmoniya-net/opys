//! What a plugin hands back to the engine.

use std::collections::HashMap;

use opys_core::{Artifact, Val, ValDefs, Valset};
use serde::{Deserialize, Serialize};

/// One named launch fragment a plugin exposes — `jvmArgs` (a `Valset`),
/// `mainClass` (a `Val`), `bin` (a bare string). The config's `command` /
/// `args` accessors pick these out by name and order them.
///
/// Untagged on the wire, and the order matters: a bare string is matched
/// before `One`, whose own bare-string form would otherwise swallow it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum LaunchFragment {
    Text(String),
    One(Val),
    Many(Valset),
}

/// A plugin's named launch fragments, looked up by name and never iterated
/// for output — hence an unordered map.
pub type LaunchGroups = HashMap<String, LaunchFragment>;

/// A plugin's build output. Every field is optional in spirit; an empty
/// default contributes nothing.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Contribution {
    /// Artifacts to download/copy/extract.
    pub artifacts: Vec<Artifact>,
    /// Manifest vars this plugin owns.
    pub vars: ValDefs,
    /// Named launch fragments, exposed to the config's accessor functions.
    pub launch: LaunchGroups,
    /// Launch environment variables this plugin sets by default.
    pub envs: ValDefs,
}

/// One plugin's output, tagged with the plugin that produced it. The name is
/// what collision warnings point at, so it travels with the contribution
/// rather than being recovered from a parallel list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginOutput {
    pub name: String,
    #[serde(default)]
    pub contribution: Contribution,
}
