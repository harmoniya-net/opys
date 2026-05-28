//! napi-rs bindings for `torba-runtime`.
//!
//! Exposes `install` and `buildLaunch`. The Rust UI consumes the native crate
//! directly — only the Node CLI goes through these bindings.

#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi::JsFunction;
use napi_derive::napi;
use serde_json::Value as Json;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use torba_runtime::{
    build_launch as rt_build_launch, install as rt_install, InstallOptions, InstallProgress,
    LaunchOptions, ManifestSource,
};

fn map_err<E: std::fmt::Display>(e: E) -> napi::Error {
    napi::Error::from_reason(e.to_string())
}

#[napi(object, js_name = "OsOptions")]
pub struct OsOptionsJs {
    pub name: String,
    pub version: String,
    pub arch: String,
}

impl From<OsOptionsJs> for torba_core::OsOptions {
    fn from(o: OsOptionsJs) -> Self {
        torba_core::OsOptions {
            name: o.name,
            version: o.version,
            arch: o.arch,
        }
    }
}

#[napi(object, js_name = "InstallOptionsJs")]
pub struct InstallOptionsJs {
    pub platform: Option<OsOptionsJs>,
    pub vars: Option<HashMap<String, String>>,
    pub concurrency: Option<u32>,
    pub verify_integrity: Option<bool>,
    pub features: Option<Vec<String>>,
}

#[napi(object, js_name = "ProgressEvent")]
#[derive(Default)]
pub struct ProgressEventJs {
    pub phase: String,
    pub fetched: Option<u32>,
    pub total: Option<u32>,
    pub skipped: Option<u32>,
    pub resolved: Option<u32>,
    pub count: Option<u32>,
    pub removed: Option<u32>,
    pub path: Option<String>,
    pub bytes: Option<i64>,
}

fn progress_to_event(p: InstallProgress) -> ProgressEventJs {
    match p {
        InstallProgress::Resolve => ProgressEventJs {
            phase: "resolve".into(),
            ..Default::default()
        },
        InstallProgress::Pointer { resolved } => ProgressEventJs {
            phase: "pointer".into(),
            resolved: Some(resolved),
            ..Default::default()
        },
        InstallProgress::Download {
            fetched,
            total,
            skipped,
        } => ProgressEventJs {
            phase: "download".into(),
            fetched: Some(fetched),
            total: Some(total),
            skipped: Some(skipped),
            ..Default::default()
        },
        InstallProgress::DownloadStart { path, total } => ProgressEventJs {
            phase: "download:start".into(),
            path: Some(path),
            bytes: Some(total as i64),
            ..Default::default()
        },
        InstallProgress::DownloadBytes { path, bytes } => ProgressEventJs {
            phase: "download:bytes".into(),
            path: Some(path),
            bytes: Some(bytes as i64),
            ..Default::default()
        },
        InstallProgress::DownloadDone { path } => ProgressEventJs {
            phase: "download:done".into(),
            path: Some(path),
            ..Default::default()
        },
        InstallProgress::Verify => ProgressEventJs {
            phase: "verify".into(),
            ..Default::default()
        },
        InstallProgress::Extract { count } => ProgressEventJs {
            phase: "extract".into(),
            count: Some(count),
            ..Default::default()
        },
        InstallProgress::Sweep { removed } => ProgressEventJs {
            phase: "sweep".into(),
            removed: Some(removed),
            ..Default::default()
        },
    }
}

/// Throttle `download:bytes` events to ~50ms — Q6 in design doc.
const BYTES_THROTTLE: Duration = Duration::from_millis(50);

struct ThrottleState {
    last_emit: Option<Instant>,
}

#[napi(js_name = "install")]
pub fn install_js(
    manifest: Json,
    options: Option<InstallOptionsJs>,
    progress: Option<JsFunction>,
) -> Result<AsyncTask<InstallTask>> {
    let wire: torba_core::ManifestWire = serde_json::from_value(manifest).map_err(map_err)?;
    let m = torba_core::decode_manifest(wire).map_err(map_err)?;

    // Convert JsFunction → ThreadsafeFunction BEFORE crossing into the async
    // task — JsFunction is !Send.
    let tsfn: Option<ThreadsafeFunction<ProgressEventJs, ErrorStrategy::Fatal>> = match progress {
        Some(cb) => Some(cb.create_threadsafe_function(0, |ctx| Ok(vec![ctx.value]))?),
        None => None,
    };

    Ok(AsyncTask::new(InstallTask {
        manifest: m,
        options,
        tsfn,
    }))
}

pub struct InstallTask {
    manifest: torba_core::Manifest,
    options: Option<InstallOptionsJs>,
    tsfn: Option<ThreadsafeFunction<ProgressEventJs, ErrorStrategy::Fatal>>,
}

impl Task for InstallTask {
    type Output = ();
    type JsValue = ();

    fn compute(&mut self) -> Result<Self::Output> {
        let manifest = std::mem::take(&mut self.manifest);
        let options = self.options.take();
        let tsfn = self.tsfn.take();

        let mut opts = InstallOptions::new();
        if let Some(o) = options {
            opts.platform = o.platform.map(Into::into);
            opts.vars = o.vars.map(IntoIterator::into_iter).map(Iterator::collect);
            opts.concurrency = o.concurrency;
            if let Some(v) = o.verify_integrity {
                opts.verify_integrity = v;
            }
            if let Some(f) = o.features {
                opts.features = f;
            }
        }
        if let Some(tsfn) = tsfn {
            let throttle = Arc::new(std::sync::Mutex::new(ThrottleState { last_emit: None }));
            opts.on_progress = Some(Arc::new(move |p| {
                if let InstallProgress::DownloadBytes { .. } = &p {
                    let mut s = throttle.lock().unwrap();
                    let now = Instant::now();
                    if let Some(prev) = s.last_emit {
                        if now.duration_since(prev) < BYTES_THROTTLE {
                            return;
                        }
                    }
                    s.last_emit = Some(now);
                }
                tsfn.call(progress_to_event(p), ThreadsafeFunctionCallMode::NonBlocking);
            }));
        }

        // Run the install on a fresh tokio runtime within this worker thread.
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(map_err)?;
        rt.block_on(async {
            rt_install(ManifestSource::Manifest(manifest), opts).await.map_err(map_err)
        })?;
        Ok(())
    }

    fn resolve(&mut self, _env: napi::Env, _output: Self::Output) -> Result<Self::JsValue> {
        Ok(())
    }
}

#[napi(object, js_name = "LaunchSpec")]
pub struct LaunchSpecJs {
    pub command: String,
    pub args: Vec<String>,
    pub workdir: String,
    pub envs: HashMap<String, String>,
}

#[napi(object, js_name = "BuildLaunchOptions")]
pub struct BuildLaunchOptionsJs {
    pub platform: Option<OsOptionsJs>,
    pub features: Option<Vec<String>>,
    pub vars: Option<HashMap<String, String>>,
    pub cwd: Option<String>,
}

/// Pure spawn-spec — no install, no spawn. Q5 in design doc.
#[napi(js_name = "buildLaunch")]
pub async fn build_launch_js(
    manifest: Json,
    options: Option<BuildLaunchOptionsJs>,
) -> Result<LaunchSpecJs> {
    let wire: torba_core::ManifestWire = serde_json::from_value(manifest).map_err(map_err)?;
    let m = torba_core::decode_manifest(wire).map_err(map_err)?;

    let mut launch_opts = LaunchOptions::new();
    launch_opts.do_install = false;
    if let Some(o) = options {
        launch_opts.platform = o.platform.map(Into::into);
        if let Some(f) = o.features {
            launch_opts.features = f;
        }
        launch_opts.vars = o.vars.map(IntoIterator::into_iter).map(Iterator::collect);
        launch_opts.cwd = o.cwd;
    }

    let (_manifest, spec) =
        rt_build_launch(ManifestSource::Manifest(m), &launch_opts).await.map_err(map_err)?;
    Ok(LaunchSpecJs {
        command: spec.command,
        args: spec.args,
        workdir: spec.workdir,
        envs: spec.envs.into_iter().collect(),
    })
}

#[napi(js_name = "currentPlatform")]
pub fn current_platform_js() -> OsOptionsJs {
    let p = torba_runtime::current_platform();
    OsOptionsJs {
        name: p.name,
        version: p.version,
        arch: p.arch,
    }
}
