#[allow(dead_code)]
mod common;

use common::{linux, osx, parse_ruleset, windows_10, windows_7};
use opys_mojang_rules::{
    satisfies_os, satisfies_rule, satisfies_ruleset, OsArch, OsConstraint, OsName, Rule, RuleAction,
};

fn action_only(action: RuleAction) -> Rule {
    Rule::Plain { action }
}

fn allow_os(name: OsName) -> Rule {
    Rule::Os {
        action: RuleAction::Allow,
        os: OsConstraint {
            name: Some(name),
            ..Default::default()
        },
    }
}

fn disallow_os(name: OsName) -> Rule {
    Rule::Os {
        action: RuleAction::Disallow,
        os: OsConstraint {
            name: Some(name),
            ..Default::default()
        },
    }
}

#[test]
fn action_only_allow_always_satisfies() {
    let rule = action_only(RuleAction::Allow);
    assert!(satisfies_rule(&rule, &linux(), &[]).unwrap());
    assert!(satisfies_rule(&rule, &windows_10(), &[]).unwrap());
    assert!(satisfies_rule(&rule, &osx(), &[]).unwrap());
}

#[test]
fn action_only_disallow_never_satisfies() {
    let rule = action_only(RuleAction::Disallow);
    assert!(!satisfies_rule(&rule, &linux(), &[]).unwrap());
    assert!(!satisfies_rule(&rule, &windows_10(), &[]).unwrap());
}

#[test]
fn allow_plus_os_only_matches_named_os() {
    let rule = allow_os(OsName::Linux);
    assert!(satisfies_rule(&rule, &linux(), &[]).unwrap());
    assert!(!satisfies_rule(&rule, &osx(), &[]).unwrap());
    assert!(!satisfies_rule(&rule, &windows_10(), &[]).unwrap());
}

#[test]
fn disallow_plus_os_fails_only_on_that_os() {
    let rule = disallow_os(OsName::Osx);
    assert!(!satisfies_rule(&rule, &osx(), &[]).unwrap());
    assert!(satisfies_rule(&rule, &linux(), &[]).unwrap());
    assert!(satisfies_rule(&rule, &windows_10(), &[]).unwrap());
}

#[test]
fn os_matches_by_name_when_no_version() {
    let c = OsConstraint {
        name: Some(OsName::Linux),
        ..Default::default()
    };
    assert!(satisfies_os(&c, &linux()).unwrap());
    assert!(!satisfies_os(&c, &osx()).unwrap());
}

#[test]
fn os_version_regex_must_match() {
    let c = OsConstraint {
        name: Some(OsName::Windows),
        version: Some(r"^10\.".into()),
        ..Default::default()
    };
    assert!(satisfies_os(&c, &windows_10()).unwrap());
    assert!(!satisfies_os(&c, &windows_7()).unwrap());
}

#[test]
fn os_arch_only_filter() {
    let c = OsConstraint {
        arch: Some(OsArch::Aarch64),
        ..Default::default()
    };
    assert!(satisfies_os(&c, &osx()).unwrap());
    assert!(!satisfies_os(&c, &linux()).unwrap());
}

#[test]
fn empty_ruleset_satisfies_vacuously() {
    let rs = parse_ruleset("[]");
    assert!(satisfies_ruleset(&rs, &linux(), &[]).unwrap());
    assert!(satisfies_ruleset(&rs, &windows_10(), &[]).unwrap());
}

#[test]
fn allow_plus_disallow_every_rule_must_pass() {
    let rs = parse_ruleset(
        r#"[
            { "action": "allow", "os": { "name": "linux" } },
            { "action": "disallow" }
        ]"#,
    );
    assert!(!satisfies_ruleset(&rs, &linux(), &[]).unwrap());
}

#[test]
fn multiple_allows_act_as_and() {
    let rs = parse_ruleset(
        r#"[
            { "action": "allow", "os": { "name": "linux" } },
            { "action": "allow", "os": { "name": "osx" } }
        ]"#,
    );
    assert!(!satisfies_ruleset(&rs, &linux(), &[]).unwrap());
    assert!(!satisfies_ruleset(&rs, &osx(), &[]).unwrap());
}

#[test]
fn arch_only_combined_with_name_only_acts_as_and() {
    let rs = parse_ruleset(
        r#"[
            { "action": "allow", "os": { "arch": "x86_64" } },
            { "action": "allow", "os": { "name": "linux" } }
        ]"#,
    );
    assert!(satisfies_ruleset(&rs, &linux(), &[]).unwrap());
    assert!(!satisfies_ruleset(&rs, &osx(), &[]).unwrap());
}

#[test]
fn throws_on_invalid_os_version_regex() {
    let c = OsConstraint {
        version: Some("(".into()),
        ..Default::default()
    };
    let err = satisfies_os(&c, &linux()).unwrap_err();
    let msg = err.to_string();
    assert!(
        msg.contains("Invalid OS version pattern"),
        "unexpected error message: {msg}"
    );
}

#[test]
fn satisfies_os_ignores_absent_fields() {
    assert!(satisfies_os(&OsConstraint::default(), &linux()).unwrap());
}

#[test]
fn satisfies_rule_bare_allow_and_disallow() {
    assert!(satisfies_rule(&Rule::Plain { action: RuleAction::Allow }, &linux(), &[]).unwrap());
    assert!(!satisfies_rule(&Rule::Plain { action: RuleAction::Disallow }, &linux(), &[]).unwrap());
}
