//! The root: the one directory an install writes into and deletes from.
//!
//! A manifest spells every path with `${root}` by convention, and nothing
//! used to hold it to that: an artifact at `/etc/x`, an archive unpacked
//! into `${root}/..`, a `clean` of somebody's home. A bundle is a file from
//! somebody else, so the convention is a rule here. `root` is the one
//! variable the runtime reads by name, and every path an install writes or
//! removes is checked against it before anything is fetched.
//!
//! The check is on the text of a path. A path is inside the root when it
//! begins with the root and never climbs with `..` after it, so a path that
//! is relative, or absolute somewhere else, is outside by construction. The
//! root is made absolute once, by the file system's own rule, and written
//! back as the variable: every `${root}/…` is then absolute, and the string
//! that was checked is the string that is opened.
//!
//! Symbolic links are not resolved. One an archive would plant is held to
//! its own directory where it is made (`archive`); one the player made
//! inside their own root — `saves` on another disk — is theirs to make.

use indexmap::IndexMap;
use opys_core::{
    interpolate, resolve_val_defs, resolve_vars, Artifact, ExtractRule, Manifest, OsOptions, VarMap,
};

use crate::errors::InstallError;
use crate::pathnorm::{is_absolute, normalize_inner, tidy};

/// The variable that says where an installation is.
pub const ROOT_VAR: &str = "root";

/// An absolute directory, and the question of whether a path is in it.
#[derive(Debug, Clone)]
pub struct Root {
    /// As the file system spells it: what `${root}` becomes, and what a
    /// refusal shows.
    path: String,
    /// Normalized, for comparison.
    key: String,
    windows: bool,
}

impl Root {
    /// `written` is already absolute: a relative root is the caller's to
    /// place, which [`confined_vars`] does against the working directory.
    pub(crate) fn new(written: &str, windows: bool) -> Result<Root, String> {
        let path = tidy(written, windows);
        if !is_absolute(&path, windows) {
            return Err(format!(
                "`{ROOT_VAR}` is `{written}`, which is not an absolute path"
            ));
        }
        // `/`, `C:` and `//`: confining an install to all of a disk confines
        // nothing.
        if path.trim_start_matches('/').is_empty() || (windows && path.ends_with(':')) {
            return Err(format!(
                "`{ROOT_VAR}` is `{written}`, which is a whole file system"
            ));
        }
        let key = normalize_inner(&path, windows);
        Ok(Root {
            path: written.to_owned(),
            key,
            windows,
        })
    }

    /// What follows the root in `path`: empty for the root itself, `None`
    /// for a path that is not in it.
    fn rest(&self, path: &str) -> Option<String> {
        let path = normalize_inner(path, self.windows);
        let rest = if path == self.key {
            ""
        } else {
            path.strip_prefix(&self.key)?.strip_prefix('/')?
        };
        // Windows drops a trailing dot or space when it opens a path, so
        // `.. ` and `...` are names here and may be `..` there. Nothing
        // legitimate is spelled that way: such a file cannot be made.
        let climbs =
            |segment: &str| segment == ".." || (self.windows && segment.ends_with(['.', ' ']));
        (!rest.split('/').any(climbs)).then(|| rest.to_owned())
    }

    /// The root or anything in it: where a directory may be.
    pub(crate) fn holds(&self, path: &str) -> bool {
        self.rest(path).is_some()
    }

    /// Strictly inside: where a file may be, the root being a directory.
    pub(crate) fn holds_inside(&self, path: &str) -> bool {
        self.rest(path).is_some_and(|rest| !rest.is_empty())
    }

    fn outside(&self, what: &str, written: &str) -> String {
        format!("{what} `{written}` is outside the root, `{}`", self.path)
    }
}

/// A manifest's variables for this machine, with `root` made absolute, and
/// the root they name.
pub(crate) fn confined_vars(
    manifest: &Manifest,
    platform: &OsOptions,
    features: &[String],
    extra: Option<&VarMap>,
) -> Result<(IndexMap<String, String>, Root), InstallError> {
    let mut flat = resolve_val_defs(&manifest.vars, platform, features)?;
    for (k, v) in extra.into_iter().flatten() {
        flat.insert(k.clone(), v.clone());
    }
    // Twice: `root` may be written in terms of other variables, and the rest
    // are written in terms of `root`.
    let first = resolve_vars(&flat).map_err(InstallError::other)?;
    let Some(written) = first.get(ROOT_VAR) else {
        return Err(InstallError::Manifest(format!(
            "no `{ROOT_VAR}`: it says where to install, and comes from the caller's variables"
        )));
    };
    // Checked as it was written: once joined to the working directory, a
    // root that was never defined would look like a directory of that name.
    if written.contains("${") {
        return Err(InstallError::Manifest(format!(
            "`{ROOT_VAR}` is `{written}`, which names a variable that is not defined"
        )));
    }
    let absolute = std::path::absolute(written).map_err(|source| InstallError::Io {
        path: written.clone(),
        source,
    })?;
    let Some(absolute) = absolute.to_str() else {
        return Err(InstallError::Manifest(format!(
            "`{ROOT_VAR}` is `{}`, which is not text",
            absolute.display()
        )));
    };
    let root = Root::new(absolute, cfg!(windows)).map_err(InstallError::Manifest)?;
    flat.insert(ROOT_VAR.to_owned(), root.path.clone());
    let vars = resolve_vars(&flat).map_err(InstallError::other)?;
    Ok((vars, root))
}

/// Refuse an artifact that would be written, unpacked or cleaned outside
/// the root. `artifacts` are the ones that apply to this machine.
pub(crate) fn check_artifacts(
    artifacts: &[Artifact],
    vars: &IndexMap<String, String>,
    root: &Root,
) -> Result<(), String> {
    for artifact in artifacts {
        if !root.holds_inside(&interpolate(&artifact.path, vars)) {
            return Err(root.outside("artifact", &artifact.path));
        }
        for rule in artifact.extract.iter().flatten() {
            let (into, inside) = match rule {
                // The directory is emptied first, so it is not the root: that
                // would take the installation, the archive included.
                ExtractRule::Dump(dump) if dump.clean.unwrap_or(false) => (
                    &dump.into,
                    root.holds_inside(&interpolate(&dump.into, vars)),
                ),
                ExtractRule::Dump(dump) => (&dump.into, root.holds(&interpolate(&dump.into, vars))),
                ExtractRule::Scan(scan) => (&scan.into, root.holds(&interpolate(&scan.into, vars))),
                // A file, not a directory.
                ExtractRule::Pick(pick) => (
                    &pick.into,
                    root.holds_inside(&interpolate(&pick.into, vars)),
                ),
            };
            if !inside {
                return Err(format!(
                    "{}, where `{}` is unpacked",
                    root.outside("`into`", into),
                    artifact.path
                ));
            }
        }
    }
    Ok(())
}

/// Refuse a working directory outside the root. `written` is the manifest's.
pub(crate) fn check_workdir(written: &str, workdir: &str, root: &Root) -> Result<(), String> {
    if root.holds(workdir) {
        Ok(())
    } else {
        Err(root.outside("workdir", written))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root(path: &str, windows: bool) -> Root {
        Root::new(path, windows).unwrap()
    }

    #[test]
    fn a_path_is_inside_when_it_begins_with_the_root_and_never_climbs() {
        let root = root("/srv/game", false);
        assert!(root.holds_inside("/srv/game/mods/a.jar"));
        // However its variables spell it: `game_directory` ends in `/`.
        assert!(root.holds_inside("/srv/game//mods/./a.jar"));
        assert!(root.holds("/srv/game"));
        assert!(root.holds("/srv/game/"));

        assert!(!root.holds("/srv/game/../other/a.jar"));
        assert!(!root.holds("/srv/game/mods/../../a.jar"));
        assert!(!root.holds("/etc/passwd"));
        assert!(!root.holds("mods/a.jar"));
        assert!(!root.holds(""));
        // A sibling whose name begins the same way.
        assert!(!root.holds("/srv/game-old/a.jar"));
    }

    #[test]
    fn the_root_itself_is_a_directory_and_not_a_file() {
        let root = root("/srv/game", false);
        assert!(root.holds("/srv/game"));
        assert!(!root.holds_inside("/srv/game"));
        assert!(!root.holds_inside("/srv/game/"));
    }

    const WIN: &str = "C:\\Users\\x\\game";

    #[test]
    fn windows_compares_without_case_or_separator() {
        let root = root(WIN, true);
        assert!(root.holds_inside("C:\\Users\\x\\game\\mods\\a.jar"));
        // What `${root}/mods/a.jar` comes to: the root's `\`, the manifest's `/`.
        assert!(root.holds_inside("C:\\Users\\x\\game/mods/a.jar"));
        assert!(root.holds_inside("c:/users/X/GAME/mods/a.jar"));
        assert!(root.holds_inside("C:\\Users\\x\\game\\\\mods\\.\\a.jar"));
        assert!(root.holds("C:\\Users\\x\\game\\"));
        assert!(root.holds("C:/Users/x/game"));
        assert!(!root.holds_inside("c:/users/x/GAME/"));
    }

    #[test]
    fn windows_climbs_with_either_separator() {
        let root = root(WIN, true);
        assert!(!root.holds("C:\\Users\\x\\game\\..\\other"));
        assert!(!root.holds("C:\\Users\\x\\game/../other"));
        assert!(!root.holds("C:\\Users\\x\\game\\mods\\..\\..\\a.jar"));
        assert!(!root.holds("C:\\Users\\x\\game/mods\\../..\\a.jar"));
        // On POSIX `\` is a letter of a name, and this is a file in the root.
        assert!(self::root("/srv/game", false).holds_inside("/srv/game/..\\a.jar"));
    }

    #[test]
    fn windows_tells_drives_shares_and_relative_paths_apart() {
        let root = root(WIN, true);
        assert!(!root.holds("D:\\Users\\x\\game\\a.jar"));
        assert!(!root.holds("\\\\host\\Users\\x\\game\\a.jar"));
        // Relative to the current drive, or to a drive's own directory.
        assert!(!root.holds("\\Users\\x\\game\\a.jar"));
        assert!(!root.holds("C:Users\\x\\game\\a.jar"));
        assert!(!root.holds("game\\a.jar"));
        // A sibling whose name begins the same way, in either case.
        assert!(!root.holds("C:\\Users\\x\\game-old\\a.jar"));
        assert!(!root.holds("C:\\Users\\x\\GAMEs\\a.jar"));

        // A root on a share holds what is on that share.
        let share = self::root("\\\\host\\packs\\game", true);
        assert!(share.holds_inside("//HOST/packs/game/mods/a.jar"));
        assert!(!share.holds("\\\\host\\packs\\other\\a.jar"));
        assert!(!share.holds("\\\\other\\packs\\game\\a.jar"));
    }

    #[test]
    fn windows_refuses_a_name_it_would_trim_into_a_climb() {
        let root = root(WIN, true);
        // Windows drops a trailing dot or space as it opens a path.
        assert!(!root.holds("C:\\Users\\x\\game\\.. "));
        assert!(!root.holds("C:\\Users\\x\\game\\.. \\a.jar"));
        assert!(!root.holds("C:\\Users\\x\\game\\mods\\..."));
        assert!(!root.holds("C:\\Users\\x\\game\\mods.\\a.jar"));
        // A dot inside a name, or ahead of it, is only a name.
        assert!(root.holds_inside("C:\\Users\\x\\game\\.cache\\a.b.jar"));
        // POSIX trims nothing, so these are names there.
        let posix = self::root("/srv/game", false);
        assert!(posix.holds_inside("/srv/game/.. /a.jar"));
        assert!(posix.holds_inside("/srv/game/mods./a.jar"));
    }

    fn checked(root: &Root, json: serde_json::Value) -> Result<(), String> {
        let artifact: Artifact = serde_json::from_value(json).unwrap();
        let vars = IndexMap::from([(ROOT_VAR.to_owned(), root.path.clone())]);
        check_artifacts(&[artifact], &vars, root)
    }

    #[test]
    fn windows_artifacts_are_held_to_the_root() {
        let root = root(WIN, true);
        let blob = serde_json::json!({ "blob": "0".repeat(64) });
        let at = |path: &str| serde_json::json!({ "path": path, "source": blob });
        let into = |rule: serde_json::Value| serde_json::json!({ "path": "${root}/a.zip", "source": blob, "extract": rule });

        assert!(checked(&root, at("${root}/mods/a.jar")).is_ok());
        assert!(checked(&root, at("${root}\\mods\\a.jar")).is_ok());
        assert!(checked(&root, at("c:/users/x/game/mods/a.jar")).is_ok());
        for path in [
            "${root}\\..\\a.jar",
            "${root}/mods\\..\\../a.jar",
            "D:\\a.jar",
            "\\a.jar",
            "mods\\a.jar",
            "${root}\\.. \\a.jar",
            "${root}",
        ] {
            let message = checked(&root, at(path)).unwrap_err();
            assert!(message.contains("outside the root"), "{path}: {message}");
            // Named as the author wrote it, with the root as the machine has it.
            assert!(
                message.contains(path) && message.contains(WIN),
                "{path}: {message}"
            );
        }

        let dump =
            |dir: &str, clean: bool| into(serde_json::json!({ "into": dir, "clean": clean }));
        assert!(checked(&root, dump("${root}\\natives", true)).is_ok());
        assert!(checked(&root, dump("${root}\\", false)).is_ok());
        // Emptied first, so never the root, and never the folder above it.
        assert!(checked(&root, dump("${root}\\", true)).is_err());
        assert!(checked(&root, dump("${root}\\..", true)).is_err());
        assert!(checked(&root, dump("${root}\\.. ", true)).is_err());
        assert!(checked(&root, dump("C:\\Users\\x", false)).is_err());

        let pick = |file: &str| into(serde_json::json!({ "file": "a.txt", "into": file }));
        assert!(checked(&root, pick("${root}\\config\\a.txt")).is_ok());
        assert!(checked(&root, pick("${root}\\..\\a.txt")).is_err());
        assert!(checked(&root, pick("${root}")).is_err());
    }

    #[test]
    fn windows_workdir_is_held_to_the_root() {
        let root = root(WIN, true);
        assert!(check_workdir("${root}/", "C:\\Users\\x\\game/", &root).is_ok());
        assert!(check_workdir("w", "c:/users/x/game/instance", &root).is_ok());
        for workdir in ["C:\\Users\\x\\game\\..", "C:\\", "C:", "\\", "instance"] {
            assert!(check_workdir("w", workdir, &root).is_err(), "{workdir}");
        }
    }

    #[test]
    fn a_root_that_confines_nothing_is_refused() {
        assert!(Root::new("/", false).unwrap_err().contains("whole file"));
        assert!(Root::new("C:\\", true).unwrap_err().contains("whole file"));
        assert!(Root::new("game", false).unwrap_err().contains("absolute"));
        assert!(Root::new("C:", true).unwrap_err().contains("whole file"));
        assert!(Root::new("\\game", true).unwrap_err().contains("absolute"));
        assert!(Root::new("C:game", true).unwrap_err().contains("absolute"));
    }
}
