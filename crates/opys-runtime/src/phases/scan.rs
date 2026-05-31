use std::collections::HashSet;
use std::path::Path;

use futures::stream::{self, StreamExt};
use opys_core::{filter_manifest, interpolate, Artifact, Manifest, OsOptions};

use crate::constants::DEFAULT_CONCURRENCY;
use crate::errors::InstallError;
use crate::phases::verify::verify_integrity;

pub struct ScanTask {
    pub artifact: Artifact,
    pub final_path: String,
}

pub struct ScanResult {
    pub tasks: Vec<ScanTask>,
    pub skipped: u32,
}

/// Decide which artifacts need fetching. A present file is skipped only if it
/// still matches its hash — so corruption or truncation of an existing file is
/// caught and re-fetched on every run, not trusted just because the path exists.
/// Hashless artifacts pass (there's nothing to check), and `force` always
/// re-fetches. The re-hashing runs with bounded concurrency.
pub async fn scan(
    manifest: &Manifest,
    vars: &indexmap::IndexMap<String, String>,
    platform: &OsOptions,
    feats: &[String],
    force: &HashSet<String>,
) -> Result<ScanResult, InstallError> {
    let applicable = filter_manifest(manifest, platform, feats)?;

    // Forced or missing artifacts go straight to the fetch list; present ones
    // are queued for a hash check.
    let mut tasks = Vec::new();
    let mut present = Vec::new();
    for u in applicable.artifacts {
        let final_path = interpolate(&u.path, vars);
        if !force.contains(&u.path) && Path::new(&final_path).exists() {
            present.push(ScanTask { artifact: u, final_path });
        } else {
            tasks.push(ScanTask { artifact: u, final_path });
        }
    }

    // Re-hash present files concurrently; keep the ones that still match and
    // re-fetch the rest.
    let verified: Vec<(ScanTask, bool)> = stream::iter(present)
        .map(|t| async move {
            let ok = verify_integrity(&t.final_path, t.artifact.integrity.as_ref()).await;
            (t, ok)
        })
        .buffer_unordered(DEFAULT_CONCURRENCY as usize)
        .collect()
        .await;

    let mut skipped: u32 = 0;
    for (task, ok) in verified {
        if ok {
            skipped += 1;
        } else {
            tasks.push(task);
        }
    }

    Ok(ScanResult { tasks, skipped })
}
