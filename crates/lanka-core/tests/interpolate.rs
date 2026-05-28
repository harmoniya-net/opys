//! Mirrors core/tests/unit/interpolate.test.ts.

use indexmap::IndexMap;
use lanka_core::{interpolate, resolve_vars};

fn vars(pairs: &[(&str, &str)]) -> IndexMap<String, String> {
    let mut m = IndexMap::new();
    for (k, v) in pairs {
        m.insert((*k).into(), (*v).into());
    }
    m
}

#[test]
fn resolves_simple_reference() {
    let r = resolve_vars(&vars(&[("a", "hello"), ("b", "${a} world")])).unwrap();
    assert_eq!(r.get("a").unwrap(), "hello");
    assert_eq!(r.get("b").unwrap(), "hello world");
}

#[test]
fn throws_on_self_reference() {
    let err = resolve_vars(&vars(&[("x", "${x}")])).unwrap_err();
    assert!(err.contains("Circular"));
}

#[test]
fn throws_on_circular_dependency() {
    let err = resolve_vars(&vars(&[("a", "${b}"), ("b", "${a}")])).unwrap_err();
    assert!(err.contains("Circular"));
}

#[test]
fn throws_on_longer_circular_chain() {
    let err =
        resolve_vars(&vars(&[("a", "${b}"), ("b", "${c}"), ("c", "${a}")])).unwrap_err();
    assert!(err.contains("Circular"));
}

#[test]
fn leaves_unknown_variable_as_is() {
    let r = resolve_vars(&vars(&[("a", "hello ${unknown}")])).unwrap();
    assert_eq!(r.get("a").unwrap(), "hello ${unknown}");
}

#[test]
fn empty_var_map_with_placeholder_returns_placeholder() {
    assert_eq!(interpolate("${x}", &IndexMap::new()), "${x}");
}

#[test]
fn escaped_dollar_becomes_literal() {
    let v = vars(&[("not_a_var", "replaced")]);
    assert_eq!(interpolate("\\${not_a_var}", &v), "${not_a_var}");
}

#[test]
fn placeholder_with_spaces_left_as_is() {
    let v = vars(&[(" spaced ", "x")]);
    assert_eq!(interpolate("${ spaced }", &v), "${ spaced }");
}

#[test]
fn multiple_missing_var_refs_all_preserved() {
    assert_eq!(interpolate("${x} and ${x}", &IndexMap::new()), "${x} and ${x}");
}

#[test]
fn chains_of_three_vars_resolve_correctly() {
    let r = resolve_vars(&vars(&[("a", "foo"), ("b", "${a}/bar"), ("c", "${b}/baz")])).unwrap();
    assert_eq!(r.get("c").unwrap(), "foo/bar/baz");
}

#[test]
fn unescapes_dollar_within_resolved_template() {
    let r = resolve_vars(&vars(&[("a", "\\${literal}")])).unwrap();
    assert_eq!(r.get("a").unwrap(), "${literal}");
}

#[test]
fn leaves_spaced_placeholder_inside_var_template_untouched() {
    let r = resolve_vars(&vars(&[("a", "${ spaced }")])).unwrap();
    assert_eq!(r.get("a").unwrap(), "${ spaced }");
}
