use std::collections::HashSet;
use std::path::Path;
use lanka_core::{filter_manifest, interpolate, Artifact, Manifest, OsOptions};

use crate::errors::InstallError;

pub struct ScanTask {
    pub artifact: Artifact,
    pub final_path: String,
}

pub struct ScanResult {
    pub tasks: Vec<ScanTask>,
    pub skipped: u32,
}

pub fn scan(
    manifest: &Manifest,
    vars: &indexmap::IndexMap<String, String>,
    platform: &OsOptions,
    feats: &[String],
    force: &HashSet<String>,
) -> Result<ScanResult, InstallError> {
    let applicable = filter_manifest(manifest, platform, feats)?;
    let mut tasks = Vec::new();
    let mut skipped: u32 = 0;

    for u in applicable.artifacts {
        let final_path = interpolate(&u.path, vars);
        if !force.contains(&u.path) && Path::new(&final_path).exists() {
            skipped += 1;
            continue;
        }
        tasks.push(ScanTask {
            artifact: u,
            final_path,
        });
    }

    Ok(ScanResult { tasks, skipped })
}
