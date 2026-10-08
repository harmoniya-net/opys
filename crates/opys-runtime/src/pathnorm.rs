//! Cross-platform path-string canonicalization for *comparison* — not for
//! filesystem access (Windows fs APIs accept either separator; these helpers
//! are for the moments we compare a walked path against an interpolated one,
//! or use one as a set key).
//!
//! `interpolate` splices a `${root}` value (which on Windows carries `\`) into
//! a `/`-separated template, yielding mixed separators; a directory walk yields
//! OS-native (`\`-joined) paths. Comparing those two as raw strings silently
//! fails on Windows. It fails on every platform when a variable ends in `/`,
//! as `game_directory` does: `${game_directory}/mods` is `…//mods`, which the
//! file system reads as `…/mods` and a string compare does not. The platform
//! branch is factored into `*_inner(_, windows)` so the Windows path is
//! unit-testable on a POSIX host.

/// Canonical form for path *string comparison*: tidied, and case-folded on
/// Windows (whose filesystem is case-insensitive).
pub fn normalize(p: &str) -> String {
    normalize_inner(p, cfg!(windows))
}

/// One spelling of a path, still good for the file system: on Windows `\`
/// becomes `/`, and everywhere an empty or `.` segment is dropped. POSIX keeps
/// `\`, a legal filename character there. `..` is left alone — resolving it
/// by text is wrong across a symbolic link — and so is a leading `//`, which
/// on Windows starts a network path.
pub fn tidy(p: &str, windows: bool) -> String {
    let slashed = if windows {
        p.replace('\\', "/")
    } else {
        p.to_owned()
    };
    let lead = if windows && slashed.starts_with("//") {
        "//"
    } else if slashed.starts_with('/') {
        "/"
    } else {
        ""
    };
    let body: Vec<&str> = slashed
        .split('/')
        .filter(|segment| !segment.is_empty() && *segment != ".")
        .collect();
    format!("{lead}{}", body.join("/"))
}

/// Whether a tidied path names one place whatever the working directory.
pub fn is_absolute(p: &str, windows: bool) -> bool {
    if !windows {
        return p.starts_with('/');
    }
    let bytes = p.as_bytes();
    p.starts_with("//")
        || (bytes.len() >= 3 && bytes[0].is_ascii_alphabetic() && &p[1..3] == ":/")
        // A bare drive, `C:`, is what `C:/` tidies to.
        || (bytes.len() == 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':')
}

pub(crate) fn normalize_inner(p: &str, windows: bool) -> String {
    let tidied = tidy(p, windows);
    if windows {
        tidied.to_lowercase()
    } else {
        tidied
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn posix_keeps_backslash_and_case() {
        // Backslash is a legal POSIX filename char — must not be touched.
        assert_eq!(tidy("a/b\\c", false), "a/b\\c");
        assert_eq!(
            normalize_inner("A/B/MixedCase.jar", false),
            "A/B/MixedCase.jar"
        );
    }

    #[test]
    fn empty_and_dot_segments_are_dropped() {
        assert_eq!(
            tidy("/srv/game//mods/./a.jar", false),
            "/srv/game/mods/a.jar"
        );
        assert_eq!(tidy("/srv/game/mods/", false), "/srv/game/mods");
        assert_eq!(tidy("/", false), "/");
        assert_eq!(tidy("mods//a.jar", false), "mods/a.jar");
        // Not resolved: across a symbolic link the text would lie.
        assert_eq!(tidy("/srv/../etc", false), "/srv/../etc");
    }

    #[test]
    fn windows_unifies_separator_and_case() {
        // The exact mixed-separator shape interpolate+walk produce on Windows.
        assert_eq!(
            tidy("C:\\Users\\x/mods\\a.jar", true),
            "C:/Users/x/mods/a.jar"
        );
        assert_eq!(
            normalize_inner("C:\\Users\\x/mods\\A.JAR", true),
            "c:/users/x/mods/a.jar"
        );
        assert_eq!(tidy("\\\\host\\share\\\\a", true), "//host/share/a");
    }

    #[test]
    fn windows_managed_and_walked_forms_agree() {
        // managed = interpolate("${root}/mods/a.jar"), root carrying `\`.
        let managed = normalize_inner("C:\\Users\\x/mods/a.jar", true);
        // walked = base.join("a.jar") → `\`-joined leaf, original case.
        let walked = normalize_inner("C:\\Users\\x/mods\\a.jar", true);
        assert_eq!(managed, walked, "managed guard and delete gate must agree");
    }

    #[test]
    fn absolute_is_told_per_platform() {
        assert!(is_absolute("/srv/game", false));
        assert!(!is_absolute("srv/game", false));
        assert!(!is_absolute("C:/Users", false));
        assert!(is_absolute("C:/Users", true));
        assert!(is_absolute("C:", true));
        assert!(is_absolute("//host/share", true));
        assert!(!is_absolute("/Users", true));
        assert!(!is_absolute("Users/x", true));
    }
}
