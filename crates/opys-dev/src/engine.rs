//! Merge plugin contributions into a `Manifest`.
//!
//! Running the plugins is the caller's job — JS drives JS closures, a native
//! builder drives Rust plugins. What both must agree on is how the resulting
//! contributions fold together, and that lives here.

use std::collections::HashMap;

use opys_bundle::Blobs;
use opys_core::{
    deduplicate_artifacts, Artifact, CleanupRule, Launch, Manifest, Val, ValDefs, Valset,
};
use serde::Deserialize;

use crate::contribution::{Contribution, LaunchFragment, PluginOutput};

/// The author-supplied half of the manifest.
///
/// The launch line is written as data. A bare string that begins with `@` —
/// `@forge.jvmArgs` — names a launch group a plugin exposes, and is replaced
/// by it here; `\@file` is the literal `@file`, which `java` reads as an
/// argument file. `command` and `workdir` take the same spelling, and there a
/// reference has to come to exactly one string. These were functions over a
/// plugin map once, which made a config code where it could be data and left
/// a misspelt group to be found at launch.
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
    /// A literal, or a reference to a group that is one string.
    pub command: String,
    /// A literal or a reference, as `command`. `None` means the manifest
    /// default, `"."`.
    #[serde(default)]
    pub workdir: Option<String>,
    #[serde(default)]
    pub args: Vec<LaunchFragment>,
    #[serde(default)]
    pub envs: ValDefs,
    /// Emitted only when non-empty, matching the wire format.
    #[serde(default)]
    pub cleanup: Vec<CleanupRule>,
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

/// Why a set of contributions and a config could not be made into a manifest.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AssembleError {
    /// A reference goes by plugin name, so a name has to mean one plugin.
    #[error("two plugins are named '{name}': rename one with `.as('…')`")]
    DuplicatePlugin { name: String },
    #[error("plugin '{plugin}': {reason}")]
    Artifact { plugin: String, reason: String },
    #[error("'{reference}' is not a reference: one is written `@plugin.group`")]
    BadReference { reference: String },
    #[error("'{reference}': there is no plugin named '{plugin}' (there are: {})", .plugins.join(", "))]
    UnknownPlugin {
        reference: String,
        plugin: String,
        plugins: Vec<String>,
    },
    #[error("'{reference}': '{plugin}' exposes no '{group}' (it has: {})", .groups.join(", "))]
    UnknownGroup {
        reference: String,
        plugin: String,
        group: String,
        groups: Vec<String>,
    },
    #[error("`{field}` is one string, and '{reference}' is not: it is a list, or carries rules")]
    NotOneString {
        field: &'static str,
        reference: String,
    },
}

/// What a bare string in the launch line says.
enum Written<'a> {
    Literal(&'a str),
    Reference { plugin: &'a str, group: &'a str },
}

/// Split at the last dot, so a plugin whose name has one can still be named.
fn written(text: &str) -> Result<Written<'_>, AssembleError> {
    if let Some(escaped) = text.strip_prefix('\\') {
        if escaped.starts_with('@') {
            return Ok(Written::Literal(escaped));
        }
    }
    let Some(path) = text.strip_prefix('@') else {
        return Ok(Written::Literal(text));
    };
    match path.rsplit_once('.') {
        Some((plugin, group)) if !plugin.is_empty() && !group.is_empty() => {
            Ok(Written::Reference { plugin, group })
        }
        _ => Err(AssembleError::BadReference {
            reference: text.to_owned(),
        }),
    }
}

fn sorted(names: impl Iterator<Item = impl AsRef<str>>) -> Vec<String> {
    let mut names: Vec<String> = names.map(|n| n.as_ref().to_owned()).collect();
    names.sort_unstable();
    names
}

/// The launch group `@plugin.group` names.
fn lookup<'a>(
    outputs: &'a [PluginOutput],
    reference: &str,
    plugin: &str,
    group: &str,
) -> Result<&'a LaunchFragment, AssembleError> {
    let Some(output) = outputs.iter().find(|o| o.name == plugin) else {
        return Err(AssembleError::UnknownPlugin {
            reference: reference.to_owned(),
            plugin: plugin.to_owned(),
            plugins: sorted(outputs.iter().map(|o| &o.name)),
        });
    };
    output
        .contribution
        .launch
        .get(group)
        .ok_or_else(|| AssembleError::UnknownGroup {
            reference: reference.to_owned(),
            plugin: plugin.to_owned(),
            group: group.to_owned(),
            groups: sorted(output.contribution.launch.keys()),
        })
}

fn text_val(text: &str) -> Val {
    Val {
        rules: Vec::new(),
        value: vec![text.to_owned()],
    }
}

/// Flatten author-ordered launch fragments into a single `Valset`, each
/// reference replaced by the group it names.
fn flatten_args(
    outputs: &[PluginOutput],
    items: &[LaunchFragment],
) -> Result<Valset, AssembleError> {
    let mut out: Valset = Vec::new();
    let mut push = |fragment: &LaunchFragment| match fragment {
        LaunchFragment::Text(s) => out.push(text_val(s)),
        LaunchFragment::Many(vs) => out.extend(vs.iter().cloned()),
        LaunchFragment::One(v) => out.push(v.clone()),
    };
    for item in items {
        match item {
            LaunchFragment::Text(text) => match written(text)? {
                Written::Literal(literal) => push(&LaunchFragment::Text(literal.to_owned())),
                Written::Reference { plugin, group } => push(lookup(outputs, text, plugin, group)?),
            },
            // Only a bare string is read for a reference. A value written
            // out in full is taken as it is, what it holds included.
            other => push(other),
        }
    }
    Ok(out)
}

/// A field that is one string on every machine: a literal, or a reference to
/// a group that is exactly that.
fn one_string(
    outputs: &[PluginOutput],
    field: &'static str,
    text: &str,
) -> Result<String, AssembleError> {
    let (plugin, group) = match written(text)? {
        Written::Literal(literal) => return Ok(literal.to_owned()),
        Written::Reference { plugin, group } => (plugin, group),
    };
    match lookup(outputs, text, plugin, group)? {
        LaunchFragment::Text(s) => Ok(s.clone()),
        LaunchFragment::One(Val { rules, value }) if rules.is_empty() && value.len() == 1 => {
            Ok(value[0].clone())
        }
        _ => Err(AssembleError::NotOneString {
            field,
            reference: text.to_owned(),
        }),
    }
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
pub fn assemble(
    outputs: &[PluginOutput],
    config: &ManifestConfig,
) -> Result<Assembled, AssembleError> {
    let mut warnings = Vec::new();

    let mut names = std::collections::BTreeSet::new();
    if let Some(twice) = outputs.iter().find(|o| !names.insert(o.name.as_str())) {
        return Err(AssembleError::DuplicatePlugin {
            name: twice.name.clone(),
        });
    }

    // Artifacts: plugin output in list order, then the literal artifacts.
    // One that is carried is read here and becomes a blob artifact, with its
    // bytes set aside for whoever writes the bundle.
    let mut artifacts: Vec<Artifact> = Vec::new();
    let mut held = Blobs::new();
    for output in outputs {
        for built in &output.contribution.artifacts {
            let (artifact, blob) =
                built
                    .clone()
                    .resolve()
                    .map_err(|error| AssembleError::Artifact {
                        plugin: output.name.clone(),
                        reason: error.to_string(),
                    })?;
            artifacts.push(artifact);
            held.extend(blob);
        }
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
    // carrying the same id carry the same thing and either copy will do. One
    // whose artifact a later plugin replaced is dropped with it.
    let named: std::collections::BTreeSet<&str> =
        artifacts.iter().filter_map(Artifact::blob_id).collect();
    let blobs: Blobs = held
        .into_iter()
        .filter(|(id, _)| named.contains(id.as_str()))
        .collect();

    let launch = Launch {
        command: one_string(outputs, "command", &config.command)?,
        workdir: match &config.workdir {
            Some(workdir) => one_string(outputs, "workdir", workdir)?,
            None => ".".to_owned(),
        },
        args: flatten_args(outputs, &config.args)?,
        envs,
    };

    Ok(Assembled {
        manifest: Manifest {
            vars,
            launch: Some(launch),
            artifacts,
            cleanup: config.cleanup.clone(),
        },
        blobs,
        warnings,
    })
}
