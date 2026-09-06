//! napi-rs bindings for `opys-dev`.
//!
//! JSON crosses the boundary as `serde_json::Value`. Note what is absent: no
//! `core` wire type is named here. The domain types decode themselves, so the
//! shapes below say only what is specific to this call — how a plugin's output
//! and the author's manifest config arrive from JS.

#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use opys_core::{Artifact, Val, ValDefs};
use opys_dev::{Contribution, LaunchFragment, ManifestConfig, PluginOutput};
use serde::Deserialize;
use serde_json::Value as Json;

fn map_err<E: std::fmt::Display>(e: E) -> napi::Error {
    napi::Error::from_reason(e.to_string())
}

#[derive(Deserialize, Default)]
struct ContributionJs {
    #[serde(default)]
    artifacts: Vec<Artifact>,
    #[serde(default)]
    vars: ValDefs,
    #[serde(default)]
    envs: ValDefs,
    // `launch` is deliberately not read: the caller resolves launch groups
    // through the author's accessors before calling in, and hands the result
    // over as `args` / `command`.
}

#[derive(Deserialize)]
struct PluginOutputJs {
    name: String,
    #[serde(default)]
    contribution: ContributionJs,
}

/// `Valset | Val | string` — a string is matched before `Val`, which would
/// otherwise swallow it through its own bare-string form.
#[derive(Deserialize)]
#[serde(untagged)]
enum LaunchFragmentJs {
    Text(String),
    Many(Vec<Val>),
    One(Val),
}

#[derive(Deserialize)]
struct ManifestConfigJs {
    #[serde(default)]
    artifacts: Vec<Artifact>,
    #[serde(default)]
    vars: ValDefs,
    command: String,
    #[serde(default)]
    workdir: Option<String>,
    #[serde(default)]
    args: Vec<LaunchFragmentJs>,
    #[serde(default)]
    envs: ValDefs,
    #[serde(default)]
    restrict: Vec<String>,
}

impl From<LaunchFragmentJs> for LaunchFragment {
    fn from(f: LaunchFragmentJs) -> Self {
        match f {
            LaunchFragmentJs::Text(s) => LaunchFragment::Text(s),
            LaunchFragmentJs::Many(v) => LaunchFragment::Many(v),
            LaunchFragmentJs::One(v) => LaunchFragment::One(v),
        }
    }
}

/// Merge plugin contributions and the author's manifest config into a
/// manifest. Returns `{ manifest, warnings }` — warnings are returned rather
/// than logged so the engine stays pure and JS keeps its own log channel.
#[napi(js_name = "assemble")]
pub fn assemble(outputs: Json, config: Json) -> Result<Json> {
    let outputs: Vec<PluginOutputJs> = serde_json::from_value(outputs).map_err(map_err)?;
    let config: ManifestConfigJs = serde_json::from_value(config).map_err(map_err)?;

    let outputs: Vec<PluginOutput> = outputs
        .into_iter()
        .map(|o| PluginOutput {
            name: o.name,
            contribution: Contribution {
                artifacts: o.contribution.artifacts,
                vars: o.contribution.vars,
                envs: o.contribution.envs,
                ..Default::default()
            },
        })
        .collect();

    let assembled = opys_dev::assemble(
        &outputs,
        &ManifestConfig {
            artifacts: config.artifacts,
            vars: config.vars,
            command: config.command,
            workdir: config.workdir,
            args: config.args.into_iter().map(Into::into).collect(),
            envs: config.envs,
            restrict: config.restrict,
        },
    );

    Ok(serde_json::json!({
        "manifest": serde_json::to_value(&assembled.manifest).map_err(map_err)?,
        "warnings": assembled.warnings,
    }))
}
