//! The last install phase: removing what the manifest's `cleanup` rules name.
//!
//! A rule is `includes` less `excludes`, both globs over whole paths. Two
//! things are true of every rule and are not the author's to switch off:
//!
//! - what the manifest installed is kept — an artifact, or a file one of them
//!   was unpacked into — so no rule can break the installation it is part of;
//! - a rule is planned before anything is fetched and refused if it could
//!   reach further than its author meant: an undefined variable, a relative
//!   path, a `..`, a path outside the root, or no directory in front of its
//!   first wildcard.

use indexmap::IndexMap;
use opys_core::{glob_base, glob_to_regex, interpolate, CleanupRule};
use regex::Regex;
use std::collections::{BTreeSet, HashSet};
use std::path::{Path, PathBuf};
use tokio::fs;

use crate::pathnorm::{is_absolute, normalize, normalize_inner, tidy};
use crate::phases::extract::EXTRACT_MARKER_SUFFIX;
use crate::root::Root;

/// One rule, with its variables resolved and its globs compiled.
#[derive(Debug)]
struct Planned {
    /// Where to walk: the directory in front of each include's first wildcard.
    bases: BTreeSet<String>,
    includes: Vec<Regex>,
    excludes: Vec<Regex>,
}

/// Every rule of a manifest, checked and ready to run.
#[derive(Debug, Default)]
pub struct CleanupPlan(Vec<Planned>);

impl CleanupPlan {
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

/// Why an include cannot be used, or `None` when it can. `glob` is already
/// interpolated and tidied.
fn refusal(glob: &str, root: &Root, windows: bool) -> Option<&'static str> {
    if glob.contains("${") {
        return Some("names a variable that is not defined");
    }
    if !is_absolute(glob, windows) {
        return Some("is not an absolute path");
    }
    if glob.split('/').any(|segment| segment == "..") {
        return Some("climbs with `..`");
    }
    let base = glob_base(glob);
    // `/*` has no base at all, and `C:/*` has only the drive.
    if base.is_empty() || (windows && base.ends_with(':')) {
        return Some("has no directory in front of its first wildcard");
    }
    // The directory it walks, which every path it can name is under.
    if !root.holds(&base) {
        return Some("is outside the root");
    }
    None
}

/// An exclude spares files, so it is read generously: one that is not an
/// absolute path matches at any depth, and `*.bak` or `mods/keep.jar` mean
/// what they look like.
fn exclude_regex(glob: &str, windows: bool) -> Regex {
    let glob = normalize_inner(glob, windows);
    if is_absolute(&glob, windows) {
        glob_to_regex(&glob)
    } else {
        glob_to_regex(&format!("**/{glob}"))
    }
}

fn plan_inner(
    rules: &[CleanupRule],
    vars: &IndexMap<String, String>,
    root: &Root,
    windows: bool,
) -> Result<CleanupPlan, String> {
    rules
        .iter()
        .map(|rule| {
            let mut bases = BTreeSet::new();
            let mut includes = Vec::new();
            for written in &rule.includes {
                let glob = tidy(&interpolate(written, vars), windows);
                if let Some(why) = refusal(&glob, root, windows) {
                    return Err(format!("cleanup: `{written}` {why}"));
                }
                bases.insert(glob_base(&glob));
                includes.push(glob_to_regex(&normalize_inner(&glob, windows)));
            }
            let excludes = rule
                .excludes
                .iter()
                .map(|written| exclude_regex(&interpolate(written, vars), windows))
                .collect();
            Ok(Planned {
                bases,
                includes,
                excludes,
            })
        })
        .collect::<Result<_, _>>()
        .map(CleanupPlan)
}

/// Resolve and check a manifest's rules. Nothing is touched: this is what an
/// install runs first, so a rule it must refuse fails before any download.
pub fn plan(
    rules: &[CleanupRule],
    vars: &IndexMap<String, String>,
    root: &Root,
) -> Result<CleanupPlan, String> {
    plan_inner(rules, vars, root, cfg!(windows))
}

impl Planned {
    /// Whether the rule names this path. `path` is normalized.
    fn names(&self, path: &str) -> bool {
        self.includes.iter().any(|rx| rx.is_match(path))
            && !self.excludes.iter().any(|rx| rx.is_match(path))
    }

    /// Whether to delete this file. `kept` is normalized, as `path` is.
    fn removes(&self, path: &str, kept: &HashSet<String>) -> bool {
        !path.ends_with(EXTRACT_MARKER_SUFFIX) && !kept.contains(path) && self.names(path)
    }
}

/// What a cleanup removed. The two are told apart because they are not the
/// same news: a file is something that was there and is gone, a directory is
/// what was left standing empty once its files were.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Removed {
    pub files: Vec<String>,
    pub directories: Vec<String>,
}

impl Removed {
    pub fn is_empty(&self) -> bool {
        self.files.is_empty() && self.directories.is_empty()
    }
}

/// Run the plan. `kept` is every path the manifest installed.
pub async fn cleanup(plan: &CleanupPlan, kept: &HashSet<String>) -> std::io::Result<Removed> {
    let kept: HashSet<String> = kept.iter().map(|path| normalize(path)).collect();
    let mut removed = Removed::default();
    for rule in &plan.0 {
        for base in &rule.bases {
            let base = PathBuf::from(base);
            if base.is_dir() {
                clean_tree(&base, rule, &kept, &mut removed).await?;
            }
        }
    }
    Ok(removed)
}

/// Remove the files a rule names under `base`, then the directories that are
/// empty afterwards — `base` among them. A directory goes when it is empty
/// and either the rule names it or the rule is what emptied it; one that was
/// empty all along and that no rule names is nobody's to remove.
async fn clean_tree(
    base: &Path,
    rule: &Planned,
    kept: &HashSet<String>,
    removed: &mut Removed,
) -> std::io::Result<()> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    let mut emptied: HashSet<PathBuf> = HashSet::new();
    let mut stack: Vec<PathBuf> = vec![base.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(mut entries) = fs::read_dir(&dir).await else {
            continue;
        };
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            let kind = entry.file_type().await?;
            // A symbolic link is neither followed nor removed.
            if kind.is_dir() {
                stack.push(path);
            } else if kind.is_file() {
                let text = path.to_string_lossy();
                if rule.removes(&normalize(&text), kept) && fs::remove_file(&path).await.is_ok() {
                    removed.files.push(text.into_owned());
                    emptied.insert(dir.clone());
                }
            }
        }
        dirs.push(dir);
    }

    // Deepest first, so a directory is looked at after everything inside it.
    dirs.sort_by_key(|dir| std::cmp::Reverse(dir.components().count()));
    for dir in dirs {
        let text = dir.to_string_lossy();
        if !(emptied.contains(&dir) || rule.names(&normalize(&text))) {
            continue;
        }
        // `remove_dir` refuses a directory that is not empty, which is the
        // check: nothing here is asked first and removed second.
        if fs::remove_dir(&dir).await.is_ok() {
            removed.directories.push(text.into_owned());
            if let Some(parent) = dir.parent().filter(|_| dir != base) {
                emptied.insert(parent.to_path_buf());
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(includes: &[&str], excludes: &[&str]) -> CleanupRule {
        CleanupRule {
            includes: includes.iter().map(|s| s.to_string()).collect(),
            excludes: excludes.iter().map(|s| s.to_string()).collect(),
        }
    }

    fn vars(pairs: &[(&str, &str)]) -> IndexMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    /// The root every test here installs into.
    fn root(windows: bool) -> Root {
        Root::new(if windows { "C:\\Users\\x" } else { "/srv/game" }, windows).unwrap()
    }

    fn planned(includes: &[&str], excludes: &[&str], v: &[(&str, &str)], windows: bool) -> Planned {
        plan_inner(
            &[rule(includes, excludes)],
            &vars(v),
            &root(windows),
            windows,
        )
        .unwrap()
        .0
        .remove(0)
    }

    fn refused(include: &str, v: &[(&str, &str)], windows: bool) -> String {
        plan_inner(&[rule(&[include], &[])], &vars(v), &root(windows), windows).unwrap_err()
    }

    #[test]
    fn an_include_that_could_reach_too_far_is_refused() {
        let root = [("root", "/srv/game")];
        assert!(refused("${rot}/mods/*", &root, false).contains("not defined"));
        assert!(refused("mods/*.jar", &root, false).contains("not an absolute path"));
        assert!(refused("${root}/../*", &root, false).contains("climbs"));
        assert!(refused("/*", &root, false).contains("no directory"));
        assert!(refused("/**", &root, false).contains("no directory"));
        assert!(refused("C:\\*", &root, true).contains("no directory"));
        // Absolute, with a directory and no `..`, and still not ours.
        assert!(refused("/home/someone/**", &root, false).contains("outside the root"));
        assert!(refused("/srv/game-old/**", &root, false).contains("outside the root"));
        assert!(refused("D:\\Users\\x\\mods\\*", &root, true).contains("outside the root"));
        // The message names the rule as its author wrote it.
        assert!(refused("${rot}/mods/*", &root, false).contains("`${rot}/mods/*`"));
    }

    #[test]
    fn one_bad_include_refuses_the_whole_plan() {
        let rules = [rule(&["/srv/game/logs/**"], &[]), rule(&["logs/**"], &[])];
        assert!(plan_inner(&rules, &vars(&[]), &root(false), false).is_err());
    }

    #[test]
    fn a_path_is_matched_however_its_variables_spell_it() {
        // `game_directory` ends in `/`, as the `minecraft` plugin defines it.
        let v = [("root", "/srv/game"), ("game_directory", "/srv/game/")];
        let rule = planned(&["${game_directory}/mods/*.jar"], &[], &v, false);
        assert_eq!(rule.bases.iter().collect::<Vec<_>>(), ["/srv/game/mods"]);

        let kept: HashSet<String> = [normalize_inner("/srv/game//mods/a.jar", false)].into();
        assert!(!rule.removes("/srv/game/mods/a.jar", &kept));
        assert!(rule.removes("/srv/game/mods/stray.jar", &kept));
        assert!(!rule.removes("/srv/game/mods/notes.txt", &kept));
        assert!(!rule.removes("/srv/game/mods/sub/deep.jar", &kept));
    }

    #[test]
    fn an_exclude_spares_what_it_names_at_any_depth_unless_it_is_absolute() {
        let v = [("root", "/srv/game")];
        let none = HashSet::new();
        let rule = planned(&["${root}/mods/**"], &["*/autogen.jar", "*.bak"], &v, false);
        assert!(!rule.removes("/srv/game/mods/autogen.jar", &none));
        assert!(!rule.removes("/srv/game/mods/deep/old.bak", &none));
        assert!(rule.removes("/srv/game/mods/stray.jar", &none));

        let rule = planned(&["${root}/*/**"], &["${root}/current/**"], &v, false);
        assert!(!rule.removes("/srv/game/current/saves/w/level.dat", &none));
        assert!(rule.removes("/srv/game/old/saves/w/level.dat", &none));
    }

    #[test]
    fn the_extraction_marker_is_never_removed() {
        let rule = planned(&["/srv/game/mods/**"], &[], &[], false);
        let none = HashSet::new();
        assert!(!rule.removes("/srv/game/mods/a.zip.opys-extracted", &none));
    }

    #[test]
    fn windows_paths_compare_without_case_or_separator() {
        let v = [("root", "C:\\Users\\x")];
        let rule = planned(&["${root}/mods/**"], &["Keep.JAR"], &v, true);
        assert_eq!(rule.bases.iter().collect::<Vec<_>>(), ["C:/Users/x/mods"]);

        let kept: HashSet<String> = [normalize_inner("C:\\Users\\x/mods/a.jar", true)].into();
        let walked = |path: &str| normalize_inner(path, true);
        assert!(!rule.removes(&walked("C:\\Users\\x\\mods\\A.jar"), &kept));
        assert!(!rule.removes(&walked("C:\\Users\\x\\mods\\keep.jar"), &kept));
        assert!(rule.removes(&walked("C:\\Users\\x\\mods\\sub\\stray.jar"), &kept));
    }
}
