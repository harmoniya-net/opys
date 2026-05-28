#[allow(dead_code)]
mod common;

use common::{feats_check, ok_check, os_check, parse_ruleset};
use opys_mojang_rules::{allow_os_ruleset, empty_ruleset, satisfies_ruleset, OsName};

#[test]
fn empty_ruleset_matches_anything() {
    let rs = parse_ruleset("[]");
    assert!(os_check(&rs, &common::linux()));
    assert!(os_check(&rs, &common::osx()));
    assert!(os_check(&rs, &common::windows_10()));
    assert!(ok_check(&rs));
    assert!(feats_check(&rs, &["any_feature"]));
}

#[test]
fn everything_except_osx() {
    let rs = parse_ruleset(
        r#"[
            { "action": "allow" },
            { "action": "disallow", "os": { "name": "osx" } }
        ]"#,
    );
    assert!(!os_check(&rs, &common::osx()));
    assert!(os_check(&rs, &common::linux()));
    assert!(os_check(&rs, &common::windows_10()));
}

#[test]
fn windows_10_only() {
    let rs = parse_ruleset(
        r#"[{ "action": "allow", "os": { "name": "windows", "version": "^10\\." } }]"#,
    );
    assert!(os_check(&rs, &common::windows_10()));
    assert!(!os_check(&rs, &common::windows_7()));
    assert!(!os_check(&rs, &common::osx()));
    assert!(!os_check(&rs, &common::linux()));
}

#[test]
fn with_features() {
    let rs = parse_ruleset(
        r#"[{ "action": "allow", "features": { "is_demo_user": true } }]"#,
    );
    assert!(feats_check(&rs, &["some_random_feature", "is_demo_user"]));
    assert!(!feats_check(&rs, &["some_random_feature"]));
    assert!(!os_check(&rs, &common::linux()));
}

#[test]
fn both_features() {
    let rs = parse_ruleset(
        r#"[{
            "action": "allow",
            "features": { "is_demo_user": true, "high_resolution": true }
        }]"#,
    );
    assert!(feats_check(&rs, &["high_resolution", "is_demo_user"]));
    assert!(!feats_check(&rs, &["is_demo_user"]));
}

#[test]
fn feature_excludes() {
    let rs = parse_ruleset(
        r#"[{
            "action": "allow",
            "features": { "is_demo_user": true, "high_resolution": false }
        }]"#,
    );
    assert!(!ok_check(&rs));
    assert!(feats_check(&rs, &["is_demo_user"]));
    assert!(!feats_check(&rs, &["is_demo_user", "high_resolution"]));
}

#[test]
fn single_rule() {
    let rs = parse_ruleset(r#"[{ "action": "allow" }]"#);
    assert!(ok_check(&rs));
}

#[test]
fn empty_ruleset_helper() {
    assert!(satisfies_ruleset(&empty_ruleset(), &common::linux(), &[]).unwrap());
}

#[test]
fn allow_os_ruleset_helper_matches_only_named_os() {
    let rs = allow_os_ruleset(OsName::Windows);
    assert!(satisfies_ruleset(&rs, &common::windows_10(), &[]).unwrap());
    assert!(!satisfies_ruleset(&rs, &common::linux(), &[]).unwrap());
    assert!(!satisfies_ruleset(&rs, &common::osx(), &[]).unwrap());
}
