//! Cross-platform path-string canonicalization for *comparison* — not for
//! filesystem access (Windows fs APIs accept either separator; these helpers
//! are for the moments we compare a walked path against an interpolated one,
//! or use one as a set key).
//!
//! `interpolate` splices a `${root}` value (which on Windows carries `\`) into
//! a `/`-separated template, yielding mixed separators; a directory walk yields
//! OS-native (`\`-joined) paths. Comparing those two as raw strings silently
//! fails on Windows — that's the bug these helpers exist to prevent. The
//! platform branch is factored into `*_inner(_, windows)` so the Windows path
//! is unit-testable on a POSIX host.

/// Unify the path separator to `/`. POSIX is left byte-for-byte (where `\` is a
/// legal filename char); Windows folds `\` to `/`.
pub fn to_slash(p: &str) -> String {
    to_slash_inner(p, cfg!(windows))
}

/// Canonical form for path *string comparison*: slash-unified, and case-folded
/// on Windows (whose filesystem is case-insensitive). On POSIX it's the
/// identity, so existing behavior is unchanged byte-for-byte.
pub fn normalize(p: &str) -> String {
    normalize_inner(p, cfg!(windows))
}

pub(crate) fn to_slash_inner(p: &str, windows: bool) -> String {
    if windows {
        p.replace('\\', "/")
    } else {
        p.to_owned()
    }
}

pub(crate) fn normalize_inner(p: &str, windows: bool) -> String {
    let slashed = to_slash_inner(p, windows);
    if windows {
        slashed.to_lowercase()
    } else {
        slashed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn posix_is_identity() {
        // Backslash is a legal POSIX filename char — must not be touched.
        assert_eq!(to_slash_inner("a/b\\c", false), "a/b\\c");
        assert_eq!(normalize_inner("A/B/MixedCase.jar", false), "A/B/MixedCase.jar");
    }

    #[test]
    fn windows_unifies_separator_and_case() {
        // The exact mixed-separator shape interpolate+walk produce on Windows.
        assert_eq!(to_slash_inner("C:\\Users\\x/mods\\a.jar", true), "C:/Users/x/mods/a.jar");
        assert_eq!(normalize_inner("C:\\Users\\x/mods\\A.JAR", true), "c:/users/x/mods/a.jar");
    }

    #[test]
    fn windows_managed_and_walked_forms_agree() {
        // managed = interpolate("${root}/mods/a.jar"), root carrying `\`.
        let managed = normalize_inner("C:\\Users\\x/mods/a.jar", true);
        // walked = base.join("a.jar") → `\`-joined leaf, original case.
        let walked = normalize_inner("C:\\Users\\x/mods\\a.jar", true);
        assert_eq!(managed, walked, "managed guard and delete gate must agree");
    }
}
