use std::collections::HashSet;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
use opys_core::{filter_manifest, interpolate, resolve_val_defs, resolve_vars, OsOptions, VarMap};

use crate::constants::DEFAULT_CONCURRENCY;
use crate::errors::InstallError;
use crate::phases::extract::{extract_all, ExtractTask};
use crate::phases::fetch::{fetch_all, FetchHooks, FetchTask};
use crate::phases::resolve::{resolve_manifest, ManifestSource};
use crate::phases::resolve_discovery::resolve_discovery;
use crate::phases::resolve_pointers::resolve_pointers;
use crate::phases::scan::scan;
use crate::phases::sweep::{sweep, SweepOptions};
use crate::phases::verify::verify_all;
use crate::platform::current_platform;

#[derive(Debug, Clone)]
pub enum InstallProgress {
    Resolve,
    Pointer { resolved: u32 },
    Download { fetched: u32, total: u32, skipped: u32 },
    DownloadStart { path: String, total: u64 },
    DownloadBytes { path: String, bytes: u64 },
    DownloadDone { path: String },
    Verify,
    Extract { count: u32 },
    Sweep { removed: u32 },
}

#[derive(Default)]
pub struct InstallOptions {
    pub platform: Option<OsOptions>,
    pub vars: Option<VarMap>,
    pub concurrency: Option<u32>,
    pub on_progress: Option<Arc<dyn Fn(InstallProgress) + Send + Sync>>,
    pub verify_integrity: bool,
    pub features: Vec<String>,
    /// Cooperative cancellation. When triggered, [`install`] stops promptly —
    /// in-flight downloads are aborted — and returns [`InstallError::Cancelled`].
    /// Defaults to a token that is never cancelled.
    pub cancel: CancellationToken,
}

impl InstallOptions {
    pub fn new() -> Self {
        Self {
            verify_integrity: true,
            ..Default::default()
        }
    }
}

pub async fn install<'a>(
    source: ManifestSource<'a>,
    options: InstallOptions,
) -> Result<(), InstallError> {
    let platform = options.platform.unwrap_or_else(current_platform);
    let extra_vars = options.vars.unwrap_or_default();
    let concurrency = options.concurrency.unwrap_or(DEFAULT_CONCURRENCY);
    let verify = options.verify_integrity;
    let features = options.features;
    let progress = options.on_progress.clone();
    let cancel = options.cancel;
    if cancel.is_cancelled() {
        return Err(InstallError::Cancelled);
    }

    let report = |p: InstallProgress| {
        if let Some(cb) = &progress {
            cb(p);
        }
    };

    report(InstallProgress::Resolve);
    let base = resolve_manifest(source).await?;
    let mut flat = resolve_val_defs(&base.vars, &platform, &features)?;
    for (k, v) in extra_vars {
        flat.insert(k, v);
    }
    let vars = resolve_vars(&flat).map_err(InstallError::other)?;

    let pointers = resolve_pointers(base, &vars, &platform).await?;
    if pointers.resolved > 0 {
        report(InstallProgress::Pointer {
            resolved: pointers.resolved,
        });
    }
    let discovered = resolve_discovery(pointers.manifest, &vars, &platform).await?;
    let manifest = discovered.manifest;
    let mut refetch = pointers.refetch;
    refetch.extend(discovered.refetch);

    let scanned = scan(&manifest, &vars, &platform, &features, &refetch).await?;
    let total_fetch = scanned.tasks.len() as u32;

    let fetch_tasks: Vec<FetchTask> = scanned
        .tasks
        .iter()
        .map(|t| FetchTask {
            artifact: t.artifact.clone(),
            final_path: t.final_path.clone(),
        })
        .collect();

    let fetched = Arc::new(std::sync::atomic::AtomicU32::new(0));

    report(InstallProgress::Download {
        fetched: 0,
        total: total_fetch,
        skipped: scanned.skipped,
    });

    let hooks = {
        let progress = progress.clone();
        let fetched = Arc::clone(&fetched);
        FetchHooks {
            on_start: progress.as_ref().map(|cb| {
                let cb = cb.clone();
                Arc::new(move |t: &FetchTask| {
                    cb(InstallProgress::DownloadStart {
                        path: t.artifact.path.clone(),
                        total: t.artifact.size.unwrap_or(0),
                    });
                }) as Arc<dyn Fn(&FetchTask) + Send + Sync>
            }),
            on_bytes: progress.as_ref().map(|cb| {
                let cb = cb.clone();
                Arc::new(move |t: &FetchTask, n: u64| {
                    cb(InstallProgress::DownloadBytes {
                        path: t.artifact.path.clone(),
                        bytes: n,
                    });
                }) as Arc<dyn Fn(&FetchTask, u64) + Send + Sync>
            }),
            on_done: Some({
                let cb = progress.clone();
                Arc::new(move |t: &FetchTask| {
                    let n = fetched.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                    if let Some(cb) = &cb {
                        cb(InstallProgress::DownloadDone {
                            path: t.artifact.path.clone(),
                        });
                        cb(InstallProgress::Download {
                            fetched: n,
                            total: total_fetch,
                            skipped: scanned.skipped,
                        });
                    }
                }) as Arc<dyn Fn(&FetchTask) + Send + Sync>
            }),
        }
    };

    fetch_all(fetch_tasks, &vars, concurrency, hooks, &cancel).await?;

    if cancel.is_cancelled() {
        return Err(InstallError::Cancelled);
    }
    if verify {
        report(InstallProgress::Verify);
        let verify_inputs: Vec<(&str, &opys_core::Artifact)> = scanned
            .tasks
            .iter()
            .map(|t| (t.final_path.as_str(), &t.artifact))
            .collect();
        let failures = verify_all(verify_inputs).await;
        if !failures.is_empty() {
            return Err(InstallError::Integrity { paths: failures });
        }
    }

    let applicable = filter_manifest(&manifest, &platform, &features)?;
    // Extraction always reruns on every install — there is no skip-if-already-
    // extracted check. Mods/configs inside an extracted archive can change
    // between launches without the archive itself changing path, so staleness
    // can't be detected by presence alone; re-extracting is the only way to
    // guarantee the output matches the manifest.
    let mut extract_tasks = Vec::new();
    for artifact in &applicable.artifacts {
        if artifact.extract.is_none() {
            continue;
        }
        let final_path = interpolate(&artifact.path, &vars);
        extract_tasks.push(ExtractTask {
            final_path,
            artifact: artifact.clone(),
        });
    }

    if cancel.is_cancelled() {
        return Err(InstallError::Cancelled);
    }
    if !extract_tasks.is_empty() {
        report(InstallProgress::Extract {
            count: extract_tasks.len() as u32,
        });
        extract_all(extract_tasks, &vars).await?;
    }

    if let Some(restrict) = manifest.restrict.as_ref().filter(|r| !r.is_empty()) {
        let managed: HashSet<String> = applicable
            .artifacts
            .iter()
            .map(|a| interpolate(&a.path, &vars))
            .collect();
        let result = sweep(restrict, &vars, SweepOptions { managed: &managed })
            .await
            .map_err(|source| InstallError::Io {
                path: String::new(),
                source,
            })?;
        if !result.removed.is_empty() {
            report(InstallProgress::Sweep {
                removed: result.removed.len() as u32,
            });
        }
    }

    Ok(())
}
