use indexmap::IndexMap;
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tokio::fs;
use opys_core::{glob_base, glob_to_regex, interpolate};

use crate::phases::extract::EXTRACT_MARKER_SUFFIX;

pub struct SweepResult {
    pub removed: Vec<String>,
}

pub struct SweepOptions<'a> {
    pub managed: &'a HashSet<String>,
}

fn is_opys_internal(abs: &str) -> bool {
    abs.ends_with(EXTRACT_MARKER_SUFFIX)
}

pub async fn sweep(
    globs: &[String],
    vars: &IndexMap<String, String>,
    options: SweepOptions<'_>,
) -> std::io::Result<SweepResult> {
    let mut removed = Vec::new();
    if globs.is_empty() {
        return Ok(SweepResult { removed });
    }

    let compiled: Vec<(String, Regex)> = globs
        .iter()
        .map(|g| {
            let interpolated = interpolate(g, vars);
            let base = glob_base(&interpolated);
            let regex = glob_to_regex(&interpolated);
            (base, regex)
        })
        .collect();

    let mut by_base: HashMap<String, Vec<Regex>> = HashMap::new();
    for (base, regex) in compiled {
        if base.is_empty() {
            continue;
        }
        by_base.entry(base).or_default().push(regex);
    }

    for (base, regexes) in by_base {
        let base_path = PathBuf::from(&base);
        if !base_path.exists() {
            continue;
        }
        sweep_subtree(&base_path, &regexes, options.managed, &mut removed).await?;
        prune_empty_children(&base_path, &mut removed).await?;
    }

    Ok(SweepResult { removed })
}

/// Iterative DFS over a subtree. Deletes any file matching a regex that
/// isn't in `managed` and isn't a opys bookkeeping marker.
async fn sweep_subtree(
    root: &Path,
    regexes: &[Regex],
    managed: &HashSet<String>,
    removed: &mut Vec<String>,
) -> std::io::Result<()> {
    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let mut rd = match fs::read_dir(&dir).await {
            Ok(r) => r,
            Err(_) => continue,
        };
        while let Some(entry) = rd.next_entry().await? {
            let abs = entry.path();
            let ft = entry.file_type().await?;
            if ft.is_dir() {
                stack.push(abs);
                continue;
            }
            if !ft.is_file() {
                continue;
            }
            let abs_str = abs.to_string_lossy().to_string();
            if is_opys_internal(&abs_str) || managed.contains(&abs_str) {
                continue;
            }
            let normalized = abs_str.replace(std::path::MAIN_SEPARATOR, "/");
            if regexes.iter().any(|rx| rx.is_match(&normalized))
                && fs::remove_file(&abs).await.is_ok()
            {
                removed.push(abs_str);
            }
        }
    }
    Ok(())
}

/// Bottom-up empty-dir prune. Collects every subdir first, then walks the
/// list in reverse (deepest-first) and removes each one that's empty.
/// Never removes `root` itself.
async fn prune_empty_children(root: &Path, removed: &mut Vec<String>) -> std::io::Result<()> {
    // Discover every subdir under root.
    let mut all_dirs: Vec<PathBuf> = Vec::new();
    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let mut rd = match fs::read_dir(&dir).await {
            Ok(r) => r,
            Err(_) => continue,
        };
        while let Some(entry) = rd.next_entry().await? {
            if entry.file_type().await?.is_dir() {
                let p = entry.path();
                all_dirs.push(p.clone());
                stack.push(p);
            }
        }
    }
    // Sort by depth descending — deepest first.
    all_dirs.sort_by_key(|p| std::cmp::Reverse(p.components().count()));
    for dir in all_dirs {
        let mut rd = match fs::read_dir(&dir).await {
            Ok(r) => r,
            Err(_) => continue,
        };
        if rd.next_entry().await?.is_none() && fs::remove_dir(&dir).await.is_ok() {
            removed.push(dir.to_string_lossy().into_owned());
        }
    }
    Ok(())
}
