//! Merge plugin contributions into a `Manifest`.
//!
//! Running the plugins is the caller's job — JS drives JS closures, a native
//! builder drives Rust plugins. What both must agree on is how the resulting
//! contributions fold together, and that lives here.

use std::collections::HashMap;

use opys_core::{deduplicate_artifacts, Artifact, Blobs, Launch, Manifest, Val, ValDefs, Valset};
use serde::Deserialize;

use crate::contribution::{Contribution, LaunchFragment, PluginOutput};

/// The author-supplied half of the manifest, with every function-valued field
/// (`command` / `args` / `workdir` / `envs`) already applied to the plugin map.
/// Evaluating those is the caller's job; they are closures in JS and would not
/// survive the trip into Rust.
///
/// Every field but `command` defaults: the author writes what they mean and
/// omits the rest. `command` is the one thing a launch cannot do without, so
/// its absence is an error rather than an empty string.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct ManifestConfig {
    /// Hand-written literal artifacts, appended after all plugin output.
    #[serde(default)]
    pub artifacts: Vec<Artifact>,
    /// Override vars layered on top of the merged plugin vars — the sanctioned
    /// silent override, so no collision warning is raised for it.
    #[serde(default)]
    pub vars: ValDefs,
    pub command: String,
    /// `None` means the manifest default, `"."`.
    #[serde(default)]
    pub workdir: Option<String>,
    #[serde(default)]
    pub args: Vec<LaunchFragment>,
    #[serde(default)]
    pub envs: ValDefs,
    /// Emitted only when non-empty, matching the wire format.
    #[serde(default)]
    pub restrict: Vec<String>,
}

/// The assembled manifest plus the collision warnings raised while merging.
///
/// Warnings are returned rather than logged through a callback: the engine
/// stays a pure function, and the caller keeps ownership of its own log
/// channel on whichever side of the boundary it lives.
#[derive(Debug, Clone, Default)]
pub struct Assembled {
    pub manifest: Manifest,
    /// Where each blob the manifest names is kept. Only those: a blob whose
    /// artifact a later plugin replaced is dropped with it.
    pub blobs: Blobs,
    pub warnings: Vec<String>,
}

/// Flatten author-ordered launch fragments into a single `Valset`.
fn flatten_args(items: &[LaunchFragment]) -> Valset {
    let mut out: Valset = Vec::new();
    for item in items {
        match item {
            LaunchFragment::Text(s) => out.push(Val {
                rules: Vec::new(),
                value: vec![s.clone()],
            }),
            LaunchFragment::Many(vs) => out.extend(vs.iter().cloned()),
            LaunchFragment::One(v) => out.push(v.clone()),
        }
    }
    out
}

/// Merge one `ValDefs` field across plugins in list order, last wins.
///
/// A key claimed by two different plugins is a warning, not an error: opys
/// has always resolved it in favour of the later plugin, and the author can
/// settle it deliberately through `ManifestConfig`.
fn merge_owned(
    outputs: &[PluginOutput],
    pick: fn(&Contribution) -> &ValDefs,
    kind: &str,
    warnings: &mut Vec<String>,
) -> ValDefs {
    let mut merged = ValDefs::new();
    let mut owner: HashMap<&str, &str> = HashMap::new();
    for output in outputs {
        for (key, value) in pick(&output.contribution) {
            let name = output.name.as_str();
            match owner.get(key.as_str()) {
                Some(prev) if *prev != name => warnings.push(format!(
                    "warning: {kind} '{key}' set by both '{prev}' and '{name}' — using '{name}'"
                )),
                _ => {}
            }
            merged.insert(key.clone(), value.clone());
            owner.insert(key.as_str(), name);
        }
    }
    merged
}

/// Fold plugin contributions and the author's manifest config into the final
/// `Manifest`.
pub fn assemble(outputs: &[PluginOutput], config: &ManifestConfig) -> Assembled {
    let mut warnings = Vec::new();

    // Artifacts: plugin output in list order, then the literal artifacts.
    let mut artifacts: Vec<Artifact> = Vec::new();
    for output in outputs {
        artifacts.extend(output.contribution.artifacts.iter().cloned());
    }
    artifacts.extend(config.artifacts.iter().cloned());
    let artifacts = deduplicate_artifacts(artifacts);

    let mut vars = merge_owned(outputs, |c| &c.vars, "var", &mut warnings);
    for (key, value) in &config.vars {
        vars.insert(key.clone(), value.clone());
    }

    let mut envs = merge_owned(outputs, |c| &c.envs, "env", &mut warnings);
    for (key, value) in &config.envs {
        envs.insert(key.clone(), value.clone());
    }

    // Blobs need no merge rule. An id is the hash of its bytes, so two plugins
    // holding the same id hold the same thing and either copy will do.
    let named: std::collections::BTreeSet<&str> =
        artifacts.iter().filter_map(Artifact::blob_id).collect();
    let blobs: Blobs = outputs
        .iter()
        .flat_map(|output| &output.contribution.blobs)
        .filter(|(id, _)| named.contains(id.as_str()))
        .map(|(id, source)| (id.clone(), source.clone()))
        .collect();

    let launch = Launch {
        command: config.command.clone(),
        workdir: config.workdir.clone().unwrap_or_else(|| ".".to_owned()),
        args: flatten_args(&config.args),
        envs,
    };

    Assembled {
        manifest: Manifest {
            vars,
            launch: Some(launch),
            artifacts,
            restrict: (!config.restrict.is_empty()).then(|| config.restrict.clone()),
        },
        blobs,
        warnings,
    }
}
