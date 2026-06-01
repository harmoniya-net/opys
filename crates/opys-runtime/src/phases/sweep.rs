use indexmap::IndexMap;
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tokio::fs;
use opys_core::{glob_base, glob_to_regex, interpolate};

use crate::pathnorm::{normalize, normalize_inner, to_slash};
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

/// Pure delete decision for one already-walked path — `true` ⇒ sweep it.
/// `managed` is the caller's pre-normalized managed set and `regexes` are built
/// from normalized globs; `windows` selects the path canonicalization. Split
/// out from the directory walk so the Windows separator/case behavior is
/// testable on a POSIX host.
fn is_swept(walked: &str, managed: &HashSet<String>, regexes: &[Regex], windows: bool) -> bool {
    let norm = normalize_inner(walked, windows);
    if is_opys_internal(&norm) || managed.contains(&norm) {
        return false;
    }
    regexes.iter().any(|rx| rx.is_match(&norm))
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

    // Build the base off a slash-unified glob (so `glob_base`, which splits on
    // `/`, finds the right prefix on Windows) and the regex off the fully
    // normalized glob (so it matches the normalized walked paths below).
    let compiled: Vec<(String, Regex)> = globs
        .iter()
        .map(|g| {
            let interpolated = interpolate(g, vars);
            let base = glob_base(&to_slash(&interpolated));
            let regex = glob_to_regex(&normalize(&interpolated));
            (base, regex)
        })
        .collect();

    // Compare managed/marker paths in the same normalized form the delete-gate
    // uses, so a separator/case difference can't make a managed file look
    // unmanaged (and get swept) on Windows.
    let managed: HashSet<String> = options.managed.iter().map(|m| normalize(m)).collect();

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
        sweep_subtree(&base_path, &regexes, &managed, &mut removed).await?;
        prune_empty_children(&base_path, &mut removed).await?;
    }

    Ok(SweepResult { removed })
}

/// Iterative DFS over a subtree. Deletes any file matching a regex that isn't
/// in `managed` and isn't a opys bookkeeping marker. `managed` is pre-normalized
/// by the caller; each walked path is normalized the same way before comparison.
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
            if is_swept(&abs_str, managed, regexes, cfg!(windows))
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Build the managed set + regex the way `sweep()` does, but pinned to
    /// `windows = true` so the Windows separator/case path is exercised on a
    /// POSIX host. Inputs mirror what `interpolate` (a `\`-carrying `${root}`
    /// spliced into a `/`-template → mixed separators) and a directory walk
    /// (`\`-joined leaf, real on-disk case) actually produce on Windows.
    fn windows_mods_setup() -> (HashSet<String>, Vec<Regex>) {
        let managed = ["C:\\Users\\x/mods/a.jar", "C:\\Users\\x/mods/Keep.JAR"]
            .iter()
            .map(|m| normalize_inner(m, true))
            .collect();
        let regex = glob_to_regex(&normalize_inner("C:\\Users\\x/mods/**", true));
        (managed, vec![regex])
    }

    #[test]
    fn windows_keeps_managed_sweeps_strays() {
        let (managed, rx) = windows_mods_setup();
        // Managed jars as the walk yields them (all-`\`, original case) survive.
        assert!(!is_swept("C:\\Users\\x\\mods\\a.jar", &managed, &rx, true));
        assert!(!is_swept("C:\\Users\\x\\mods\\Keep.JAR", &managed, &rx, true), "case-insensitive on Windows");
        // Strays under the glob are swept (flat and nested).
        assert!(is_swept("C:\\Users\\x\\mods\\stray.jar", &managed, &rx, true));
        assert!(is_swept("C:\\Users\\x\\mods\\sub\\nested.jar", &managed, &rx, true));
        // The extract marker is internal and never swept.
        assert!(!is_swept("C:\\Users\\x\\mods\\a.jar.opys-extracted", &managed, &rx, true));
    }

    #[test]
    fn windows_regression_raw_compare_would_delete_managed() {
        // Demonstrates the original bug and the fix on the same inputs: a raw
        // string compare never matches the `\`-joined walked path against the
        // `/`-interpolated managed entry, so the managed jar would be swept.
        // Normalizing both sides makes them agree.
        let raw: HashSet<String> = ["C:\\Users\\x/mods/a.jar"].iter().map(|s| s.to_string()).collect();
        assert!(!raw.contains("C:\\Users\\x\\mods\\a.jar"), "raw compare misses it — the bug");

        let (managed, rx) = windows_mods_setup();
        assert!(!is_swept("C:\\Users\\x\\mods\\a.jar", &managed, &rx, true), "fix keeps it");
    }

    #[test]
    fn posix_decision_is_unchanged() {
        let managed: HashSet<String> = ["/home/u/mods/a.jar"]
            .iter()
            .map(|m| normalize_inner(m, false))
            .collect();
        let rx = vec![glob_to_regex(&normalize_inner("/home/u/mods/**", false))];
        assert!(!is_swept("/home/u/mods/a.jar", &managed, &rx, false));
        assert!(is_swept("/home/u/mods/stray.jar", &managed, &rx, false));
        // POSIX is case-sensitive: a different-cased path is NOT managed.
        assert!(is_swept("/home/u/mods/A.jar", &managed, &rx, false));
    }
}
