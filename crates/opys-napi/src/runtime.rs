//! The `runtime` namespace: `opys-runtime`, as JS sees it.
//!
//! Exposes `install` and `buildLaunch`. The Rust UI consumes the native crate
//! directly — only the Node CLI goes through these bindings.

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi::JsFunction;
use napi_derive::napi;
use serde_json::Value as Json;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use opys_runtime::{
    build_launch as rt_build_launch, install as rt_install, prepare as rt_prepare,
    read_head as rt_read_head, InstallOptions, InstallProgress, LaunchOptions, ManifestSource,
};

fn map_err<E: std::fmt::Display>(e: E) -> napi::Error {
    napi::Error::from_reason(e.to_string())
}

/// A failed install, thrown as the JSON of its [`opys_runtime::ErrorReport`].
/// An error crosses napi as a message and nothing else, so the message is
/// where the structure goes; `@opys/runtime` turns it back into a typed error
/// and no caller ever sees the JSON.
fn install_err(e: opys_runtime::InstallError) -> napi::Error {
    match serde_json::to_string(&e.report()) {
        Ok(report) => napi::Error::from_reason(report),
        Err(_) => map_err(e),
    }
}

#[napi(namespace = "runtime", object, js_name = "OsOptions")]
pub struct OsOptionsJs {
    pub name: String,
    pub version: String,
    pub arch: String,
}

impl From<OsOptionsJs> for opys_core::OsOptions {
    fn from(o: OsOptionsJs) -> Self {
        opys_core::OsOptions {
            name: o.name,
            version: o.version,
            arch: o.arch,
        }
    }
}

#[napi(namespace = "runtime", object, js_name = "InstallOptionsJs")]
pub struct InstallOptionsJs {
    pub platform: Option<OsOptionsJs>,
    pub vars: Option<HashMap<String, String>>,
    pub concurrency: Option<u32>,
    pub verify_integrity: Option<bool>,
    pub features: Option<Vec<String>>,
}

#[napi(namespace = "runtime", object, js_name = "ProgressEvent")]
#[derive(Default)]
pub struct ProgressEventJs {
    pub phase: String,
    pub fetched: Option<u32>,
    pub total: Option<u32>,
    pub skipped: Option<u32>,
    pub count: Option<u32>,
    pub removed: Option<u32>,
    pub directories: Option<u32>,
    pub path: Option<String>,
    pub bytes: Option<i64>,
    pub total_bytes: Option<i64>,
}

fn progress_to_event(p: InstallProgress) -> ProgressEventJs {
    match p {
        InstallProgress::Resolve => ProgressEventJs {
            phase: "resolve".into(),
            ..Default::default()
        },
        InstallProgress::Download {
            fetched,
            total,
            skipped,
            bytes,
            total_bytes,
        } => ProgressEventJs {
            phase: "download".into(),
            fetched: Some(fetched),
            total: Some(total),
            skipped: Some(skipped),
            bytes: Some(bytes as i64),
            total_bytes: Some(total_bytes as i64),
            ..Default::default()
        },
        InstallProgress::DownloadStart { path, total } => ProgressEventJs {
            phase: "download:start".into(),
            path: Some(path),
            total_bytes: Some(total as i64),
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
        InstallProgress::Cleanup {
            removed,
            directories,
        } => ProgressEventJs {
            phase: "cleanup".into(),
            removed: Some(removed),
            directories: Some(directories),
            ..Default::default()
        },
    }
}

/// Throttle `download:bytes` events to ~50ms — Q6 in design doc.
const BYTES_THROTTLE: Duration = Duration::from_millis(50);

struct ThrottleState {
    last_emit: Option<Instant>,
}

fn install_options(
    options: Option<InstallOptionsJs>,
    tsfn: Option<ThreadsafeFunction<ProgressEventJs, ErrorStrategy::Fatal>>,
) -> InstallOptions {
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
            tsfn.call(
                progress_to_event(p),
                ThreadsafeFunctionCallMode::NonBlocking,
            );
        }));
    }
    opts
}

fn launch_options(options: Option<BuildLaunchOptionsJs>) -> LaunchOptions {
    let mut opts = LaunchOptions::new();
    opts.do_install = false;
    if let Some(o) = options {
        opts.platform = o.platform.map(Into::into);
        if let Some(f) = o.features {
            opts.features = f;
        }
        opts.vars = o.vars.map(IntoIterator::into_iter).map(Iterator::collect);
        opts.cwd = o.cwd;
    }
    opts
}

/// The phase of the event that follows every other: see [`finished`].
const END_PHASE: &str = "end";

/// Tell the callback there is nothing more to come. A promise and a
/// threadsafe function reach JS by two queues, and nothing orders one
/// against the other: an install could resolve with its last events still
/// on their way, so that a caller who read its progress on return found the
/// tail missing, now and then. The callback's own queue is in order, so the
/// last thing put on it is a marker, and `@opys/runtime` settles once it has
/// seen it. The marker is the wrapper's and never reaches the caller.
fn finished(tsfn: &Option<ThreadsafeFunction<ProgressEventJs, ErrorStrategy::Fatal>>) {
    if let Some(tsfn) = tsfn {
        tsfn.call(
            ProgressEventJs {
                phase: END_PHASE.into(),
                ..Default::default()
            },
            ThreadsafeFunctionCallMode::NonBlocking,
        );
    }
}

/// JsFunction is !Send, so it becomes a ThreadsafeFunction before the task
/// that calls it leaves the main thread.
fn threadsafe(
    progress: Option<JsFunction>,
) -> Result<Option<ThreadsafeFunction<ProgressEventJs, ErrorStrategy::Fatal>>> {
    progress
        .map(|cb| cb.create_threadsafe_function(0, |ctx| Ok(vec![ctx.value])))
        .transpose()
}

/// Run `future` to completion on a fresh tokio runtime within this worker
/// thread.
fn block_on<T>(
    future: impl std::future::Future<Output = std::result::Result<T, opys_runtime::InstallError>>,
) -> Result<T> {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(map_err)?
        .block_on(future)
        .map_err(install_err)
}

fn spec_to_js(spec: opys_runtime::LaunchSpec) -> LaunchSpecJs {
    LaunchSpecJs {
        command: spec.command,
        args: spec.args,
        workdir: spec.workdir,
        envs: spec.envs.into_iter().collect(),
    }
}

/// Install from `source`: `{ manifest }`, `{ bundle }` or `{ url }`.
/// The source decodes itself — see `opys_runtime::ManifestSource`.
#[napi(namespace = "runtime", js_name = "install")]
pub fn install_js(
    source: Json,
    options: Option<InstallOptionsJs>,
    progress: Option<JsFunction>,
) -> Result<AsyncTask<InstallTask>> {
    Ok(AsyncTask::new(InstallTask {
        source: Some(serde_json::from_value(source).map_err(map_err)?),
        options,
        tsfn: threadsafe(progress)?,
    }))
}

pub struct InstallTask {
    source: Option<ManifestSource>,
    options: Option<InstallOptionsJs>,
    tsfn: Option<ThreadsafeFunction<ProgressEventJs, ErrorStrategy::Fatal>>,
}

impl Task for InstallTask {
    type Output = ();
    type JsValue = ();

    fn compute(&mut self) -> Result<Self::Output> {
        let source = self.source.take().expect("a task is computed once");
        let tsfn = self.tsfn.take();
        let opts = install_options(self.options.take(), tsfn.clone());
        let result = block_on(rt_install(source, opts));
        // Whatever the outcome: a failed install has events of its own.
        finished(&tsfn);
        result
    }

    fn resolve(&mut self, _env: napi::Env, _output: Self::Output) -> Result<Self::JsValue> {
        Ok(())
    }
}

/// The head of the bundle a source names, or `null` for a manifest in
/// memory. The manifest is left unread, and a URL is asked for the front of
/// the file alone.
#[napi(namespace = "runtime", js_name = "readHead")]
pub async fn read_head_js(source: Json) -> Result<Option<Json>> {
    let source: ManifestSource = serde_json::from_value(source).map_err(map_err)?;
    rt_read_head(&source)
        .await
        .map_err(install_err)?
        .map(|head| serde_json::to_value(head).map_err(map_err))
        .transpose()
}

#[napi(namespace = "runtime", object, js_name = "LaunchSpec")]
pub struct LaunchSpecJs {
    pub command: String,
    pub args: Vec<String>,
    pub workdir: String,
    pub envs: HashMap<String, String>,
}

#[napi(namespace = "runtime", object, js_name = "BuildLaunchOptions")]
pub struct BuildLaunchOptionsJs {
    pub platform: Option<OsOptionsJs>,
    pub features: Option<Vec<String>>,
    pub vars: Option<HashMap<String, String>>,
    pub cwd: Option<String>,
}

/// Pure spawn-spec — no install, no spawn. Q5 in design doc.
#[napi(namespace = "runtime", js_name = "buildLaunch")]
pub async fn build_launch_js(
    source: Json,
    options: Option<BuildLaunchOptionsJs>,
) -> Result<LaunchSpecJs> {
    let source: ManifestSource = serde_json::from_value(source).map_err(map_err)?;
    rt_build_launch(source, &launch_options(options))
        .await
        .map(spec_to_js)
        .map_err(install_err)
}

/// Install, then say what to spawn — from one reading of the source, so a
/// bundle is opened, or downloaded, once for both.
#[napi(namespace = "runtime", js_name = "prepare")]
pub fn prepare_js(
    source: Json,
    launch: Option<BuildLaunchOptionsJs>,
    install: Option<InstallOptionsJs>,
    progress: Option<JsFunction>,
) -> Result<AsyncTask<PrepareTask>> {
    Ok(AsyncTask::new(PrepareTask {
        source: Some(serde_json::from_value(source).map_err(map_err)?),
        launch,
        install,
        tsfn: threadsafe(progress)?,
    }))
}

pub struct PrepareTask {
    source: Option<ManifestSource>,
    launch: Option<BuildLaunchOptionsJs>,
    install: Option<InstallOptionsJs>,
    tsfn: Option<ThreadsafeFunction<ProgressEventJs, ErrorStrategy::Fatal>>,
}

impl Task for PrepareTask {
    type Output = opys_runtime::LaunchSpec;
    type JsValue = LaunchSpecJs;

    fn compute(&mut self) -> Result<Self::Output> {
        let source = self.source.take().expect("a task is computed once");
        let mut opts = launch_options(self.launch.take());
        opts.do_install = true;
        let tsfn = self.tsfn.take();
        opts.install = Some(install_options(self.install.take(), tsfn.clone()));
        let result = block_on(rt_prepare(source, opts));
        finished(&tsfn);
        result
    }

    fn resolve(&mut self, _env: napi::Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(spec_to_js(output))
    }
}

#[napi(namespace = "runtime", js_name = "currentPlatform")]
pub fn current_platform_js() -> OsOptionsJs {
    let p = opys_runtime::current_platform();
    OsOptionsJs {
        name: p.name,
        version: p.version,
        arch: p.arch,
    }
}
