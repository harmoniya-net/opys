use indexmap::IndexMap;
use std::collections::HashSet;
use std::path::Path;
use tokio::fs;
use opys_core::{interpolate, Artifact, ExtractRule};

use crate::archive::{extract_archive, extract_archive_pick};
use crate::errors::InstallError;
use crate::pathnorm::normalize;

pub const EXTRACT_MARKER_SUFFIX: &str = ".opys-extracted";

pub struct ExtractTask {
    pub final_path: String,
    pub artifact: Artifact,
}

pub async fn extract_all(
    tasks: Vec<ExtractTask>,
    vars: &IndexMap<String, String>,
) -> Result<(), InstallError> {
    let mut cleaned: HashSet<String> = HashSet::new();
    for task in tasks {
        if task.artifact.extract.is_none() {
            continue;
        }
        let path = task.artifact.path.clone();
        if let Err(err) = extract_artifact(&task.final_path, &task.artifact, vars, &mut cleaned).await {
            return Err(InstallError::Extraction {
                artifact_path: path,
                source: Box::new(err),
            });
        }
    }
    Ok(())
}

async fn extract_artifact(
    final_path: &str,
    artifact: &Artifact,
    vars: &IndexMap<String, String>,
    cleaned: &mut HashSet<String>,
) -> std::io::Result<()> {
    if let Some(rules) = &artifact.extract {
        for rule in rules {
            match rule {
                ExtractRule::Dump(d) => {
                    let target_dir = interpolate(&d.into, vars);
                    // Key the "already cleaned this run" set on the normalized
                    // path, so two rules naming the same dir with different
                    // case/separators on Windows don't each `remove_dir_all` it
                    // — the second wipe would erase the first rule's output.
                    let cleaned_key = normalize(&target_dir);
                    if d.clean.unwrap_or(false) && !cleaned.contains(&cleaned_key) {
                        let _ = fs::remove_dir_all(&target_dir).await;
                        cleaned.insert(cleaned_key);
                    }
                    fs::create_dir_all(&target_dir).await?;
                    let excludes = d
                        .excludes
                        .clone()
                        .unwrap_or_else(|| vec!["META-INF/".into()]);
                    extract_archive(
                        final_path,
                        Path::new(&target_dir),
                        d.includes.as_deref(),
                        Some(&excludes),
                        None,
                    )
                    .await?;
                }
                ExtractRule::Scan(s) => {
                    let target_dir = interpolate(&s.into, vars);
                    fs::create_dir_all(&target_dir).await?;
                    let mut includes: Vec<String> = vec![s.matches.clone()];
                    if let Some(extra) = &s.includes {
                        includes.extend(extra.iter().cloned());
                    }
                    extract_archive(
                        final_path,
                        Path::new(&target_dir),
                        Some(&includes),
                        s.excludes.as_deref(),
                        s.strip.as_deref(),
                    )
                    .await?;
                }
                ExtractRule::Pick(p) => {
                    let dest = interpolate(&p.into, vars);
                    extract_archive_pick(final_path, &p.file, Path::new(&dest)).await?;
                }
            }
        }
    }
    let marker = format!("{final_path}{EXTRACT_MARKER_SUFFIX}");
    fs::write(&marker, b"").await?;
    Ok(())
}
