use indexmap::IndexMap;
use tokio::process::{Child, Command};
use lanka_core::{
    interpolate, resolve_val_defs, resolve_vars, resolved_args, resolved_envs, Manifest,
    OsOptions, VarMap,
};

use crate::errors::InstallError;
use crate::install::{install, InstallOptions};
use crate::phases::resolve::{resolve_manifest, ManifestSource};
use crate::platform::current_platform;

#[derive(Debug, Clone)]
pub struct LaunchSpec {
    pub command: String,
    pub args: Vec<String>,
    pub workdir: String,
    pub envs: IndexMap<String, String>,
}

#[derive(Default)]
pub struct LaunchOptions {
    pub platform: Option<OsOptions>,
    pub features: Vec<String>,
    pub vars: Option<VarMap>,
    /// Override the manifest's `launch.workdir`. Interpolated against vars.
    pub cwd: Option<String>,
    pub install: Option<InstallOptions>,
    /// When `false`, skip the nested install.
    pub do_install: bool,
}

impl LaunchOptions {
    pub fn new() -> Self {
        Self {
            do_install: true,
            ..Default::default()
        }
    }
}

/// Build a `LaunchSpec` without spawning. The pure half exported via napi.
pub async fn build_launch<'a>(
    source: ManifestSource<'a>,
    options: &LaunchOptions,
) -> Result<(Manifest, LaunchSpec), InstallError> {
    let manifest = resolve_manifest(source).await?;
    let platform = options.platform.clone().unwrap_or_else(current_platform);
    let features = options.features.clone();

    let mut flat = resolve_val_defs(&manifest.vars, &platform, &features)?;
    if let Some(extra) = &options.vars {
        for (k, v) in extra.clone() {
            flat.insert(k, v);
        }
    }
    let vars = resolve_vars(&flat).map_err(InstallError::other)?;

    let Some(config) = &manifest.launch else {
        return Err(InstallError::other("No launch config in manifest"));
    };

    let command = interpolate(&config.command, &vars);
    let workdir = interpolate(options.cwd.as_deref().unwrap_or(&config.workdir), &vars);
    let args = resolved_args(config, &platform, &features)?
        .into_iter()
        .map(|a| interpolate(&a, &vars))
        .collect();
    let raw_envs = resolved_envs(config, &platform, &features)?;
    let mut envs = IndexMap::new();
    for (k, v) in raw_envs {
        envs.insert(k, interpolate(&v, &vars));
    }

    Ok((
        manifest,
        LaunchSpec {
            command,
            args,
            workdir,
            envs,
        },
    ))
}

/// Public Rust API for the UI: install (optional), build spec, spawn.
pub async fn launch<'a>(
    source: ManifestSource<'a>,
    mut options: LaunchOptions,
) -> Result<Child, InstallError> {
    let do_install = options.do_install;
    let install_opts = options.install.take().unwrap_or_default();
    let platform = options.platform.clone().unwrap_or_else(current_platform);
    let features = options.features.clone();
    let extra_vars = options.vars.clone().unwrap_or_default();

    // Compute the spec from a freshly-resolved manifest.
    let (manifest, spec) = build_launch(source, &options).await?;

    if do_install {
        let mut io = install_opts;
        io.platform = Some(platform);
        io.features = features;
        io.vars = Some(extra_vars);
        install(ManifestSource::Manifest(manifest), io).await?;
    }

    let mut cmd = Command::new(&spec.command);
    cmd.args(&spec.args).current_dir(&spec.workdir);
    for (k, v) in &spec.envs {
        cmd.env(k, v);
    }
    cmd.spawn().map_err(|source| InstallError::Io {
        path: spec.command.clone(),
        source,
    })
}

