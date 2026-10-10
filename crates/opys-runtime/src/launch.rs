use indexmap::IndexMap;
use opys_core::{
    interpolate, resolve_val_defs, resolve_vars, resolved_args, resolved_envs, Manifest, OsOptions,
    VarMap,
};
use tokio::process::{Child, Command};

use crate::errors::InstallError;
use crate::install::{install_resolved, InstallOptions, InstallProgress};
use crate::phases::resolve::{resolve, resolve_manifest, ManifestSource};
use crate::platform::current_platform;
use crate::root::{check_workdir, confined_vars};

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

/// A manifest's variables as they are written: what a question about a
/// launch is answered from, for any platform and with nothing read.
fn plain_vars(
    manifest: &Manifest,
    options: &LaunchOptions,
) -> Result<IndexMap<String, String>, InstallError> {
    let platform = options.platform.clone().unwrap_or_else(current_platform);
    let mut flat = resolve_val_defs(&manifest.vars, &platform, &options.features)?;
    if let Some(extra) = &options.vars {
        for (k, v) in extra.clone() {
            flat.insert(k, v);
        }
    }
    resolve_vars(&flat).map_err(InstallError::other)
}

/// The spawn-spec a manifest describes under `vars`. Pure.
fn launch_spec(
    manifest: &Manifest,
    options: &LaunchOptions,
    vars: &IndexMap<String, String>,
) -> Result<LaunchSpec, InstallError> {
    let platform = options.platform.clone().unwrap_or_else(current_platform);
    let features = &options.features;

    let Some(config) = &manifest.launch else {
        return Err(InstallError::other("No launch config in manifest"));
    };

    let command = interpolate(&config.command, vars);
    let workdir = interpolate(options.cwd.as_deref().unwrap_or(&config.workdir), vars);
    let args = resolved_args(config, &platform, features)?
        .into_iter()
        .map(|a| interpolate(&a, vars))
        .collect();
    let raw_envs = resolved_envs(config, &platform, features)?;
    let mut envs = IndexMap::new();
    for (k, v) in raw_envs {
        envs.insert(k, interpolate(&v, vars));
    }

    Ok(LaunchSpec {
        command,
        args,
        workdir,
        envs,
    })
}

/// Build a `LaunchSpec` without installing or spawning. It is a question,
/// possibly about another platform, so paths come back as the manifest and
/// the caller spelled them and nothing is held to the root: [`prepare`] is
/// what answers for this machine.
pub async fn build_launch(
    source: ManifestSource,
    options: &LaunchOptions,
) -> Result<LaunchSpec, InstallError> {
    let manifest = resolve_manifest(source).await?;
    launch_spec(&manifest, options, &plain_vars(&manifest, options)?)
}

/// What to spawn on this machine: the root made absolute, as an install
/// makes it, and the manifest's working directory held to it. A `cwd` the
/// caller gave is the caller's, and so is the command: `java` off the `PATH`
/// is outside every root, and is what `java({ system: true })` asks for.
fn confined_spec(manifest: &Manifest, options: &LaunchOptions) -> Result<LaunchSpec, InstallError> {
    let platform = options.platform.clone().unwrap_or_else(current_platform);
    let (vars, root) = confined_vars(
        manifest,
        &platform,
        &options.features,
        options.vars.as_ref(),
    )?;
    let spec = launch_spec(manifest, options, &vars)?;
    if let (None, Some(config)) = (&options.cwd, &manifest.launch) {
        check_workdir(&config.workdir, &spec.workdir, &root).map_err(InstallError::Manifest)?;
    }
    Ok(spec)
}

/// Install (unless `do_install` is off) and return what to spawn. The source
/// is resolved once for both, so a bundle is opened — or downloaded — once.
pub async fn prepare(
    source: ManifestSource,
    mut options: LaunchOptions,
) -> Result<LaunchSpec, InstallError> {
    if !options.do_install {
        return confined_spec(&resolve_manifest(source).await?, &options);
    }
    let mut io = options.install.take().unwrap_or_default();
    if io.cancel.is_cancelled() {
        return Err(InstallError::Cancelled);
    }
    if let Some(cb) = &io.on_progress {
        cb(InstallProgress::Resolve);
    }
    let resolved = resolve(source).await?;
    // A manifest that cannot be launched is found out before it is installed.
    let spec = confined_spec(&resolved.manifest, &options)?;

    io.platform = Some(options.platform.clone().unwrap_or_else(current_platform));
    io.features = options.features.clone();
    io.vars = Some(options.vars.clone().unwrap_or_default());
    install_resolved(resolved, io).await?;
    Ok(spec)
}

/// Public Rust API for the UI: install (optional), build spec, spawn.
pub async fn launch(source: ManifestSource, options: LaunchOptions) -> Result<Child, InstallError> {
    let spec = prepare(source, options).await?;

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
