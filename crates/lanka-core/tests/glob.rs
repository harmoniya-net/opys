//! Mirrors core/tests/unit/glob.test.ts.

use lanka_core::{glob_base, glob_to_regex};

fn matches(glob: &str, path: &str) -> bool {
    glob_to_regex(glob).is_match(path)
}

#[test]
fn literal_path_matches_itself_only() {
    assert!(matches("mods/foo.jar", "mods/foo.jar"));
    assert!(!matches("mods/foo.jar", "mods/bar.jar"));
}

#[test]
fn star_matches_single_segment() {
    assert!(matches("mods/*.jar", "mods/foo.jar"));
    assert!(!matches("mods/*.jar", "mods/sub/foo.jar"));
    assert!(!matches("mods/*.jar", "mods/foo.txt"));
}

#[test]
fn double_star_middle_matches_zero_or_more_segments() {
    assert!(matches("mods/**/*.jar", "mods/foo.jar"));
    assert!(matches("mods/**/*.jar", "mods/sub/foo.jar"));
    assert!(matches("mods/**/*.jar", "mods/a/b/c/foo.jar"));
    assert!(!matches("mods/**/*.jar", "mods/foo.txt"));
}

#[test]
fn double_star_prefix_matches_anywhere() {
    assert!(matches("**/*.jar", "foo.jar"));
    assert!(matches("**/*.jar", "a/foo.jar"));
    assert!(matches("**/*.jar", "a/b/foo.jar"));
}

#[test]
fn double_star_suffix_matches_subtree() {
    assert!(matches("mods/**", "mods"));
    assert!(matches("mods/**", "mods/foo"));
    assert!(matches("mods/**", "mods/a/b/c"));
    assert!(!matches("mods/**", "other/foo"));
}

#[test]
fn question_matches_one_nonsep_char() {
    assert!(matches("a?.jar", "ab.jar"));
    assert!(!matches("a?.jar", "abc.jar"));
    assert!(!matches("a?.jar", "a/.jar"));
}

#[test]
fn brace_alternation() {
    assert!(matches("mods/*.{jar,zip}", "mods/foo.jar"));
    assert!(matches("mods/*.{jar,zip}", "mods/foo.zip"));
    assert!(!matches("mods/*.{jar,zip}", "mods/foo.txt"));
}

#[test]
fn escapes_regex_metacharacters_in_literal_segments() {
    assert!(!matches("mods/a.jar", "modsXjar"));
    assert!(matches("mods/a+b.jar", "mods/a+b.jar"));
    assert!(matches("mods/(x).jar", "mods/(x).jar"));
}

#[test]
fn bare_double_star_matches_across_separators() {
    assert!(matches("a**b", "ab"));
    assert!(matches("a**b", "a/x/y/b"));
    assert!(matches("a**b", "a/x/yb"));
}

#[test]
fn unclosed_brace_treated_as_literal() {
    assert!(matches("mods/{ab", "mods/{ab"));
    assert!(!matches("mods/{ab", "mods/ab"));
}

#[test]
fn glob_base_returns_dir_before_first_wildcard() {
    assert_eq!(glob_base("/home/x/mods/**/*.jar"), "/home/x/mods");
    assert_eq!(glob_base("/home/x/mods/*.jar"), "/home/x/mods");
    assert_eq!(glob_base("/home/x/mods/foo.jar"), "/home/x/mods");
}

#[test]
fn glob_base_returns_empty_when_no_fixed_prefix() {
    assert_eq!(glob_base("*.jar"), "");
    assert_eq!(glob_base("**/*.jar"), "");
}

#[test]
fn glob_base_handles_brace_and_bracket_wildcards() {
    assert_eq!(glob_base("/x/y/{a,b}/c"), "/x/y");
    assert_eq!(glob_base("/x/y/[abc]/c"), "/x/y");
}
