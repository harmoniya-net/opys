use opys_mojang_rules::{satisfies_ruleset, OsOptions, Ruleset};

pub fn linux() -> OsOptions {
    OsOptions {
        name: "linux".into(),
        version: "21.04 (Hippo)".into(),
        arch: "x86_64".into(),
    }
}

pub fn osx() -> OsOptions {
    OsOptions {
        name: "osx".into(),
        version: "11.1".into(),
        arch: "aarch64".into(),
    }
}

pub fn windows_7() -> OsOptions {
    OsOptions {
        name: "windows".into(),
        version: "7.0.16320".into(),
        arch: "x86_64".into(),
    }
}

pub fn windows_10() -> OsOptions {
    OsOptions {
        name: "windows".into(),
        version: "10.0.19041".into(),
        arch: "x86_64".into(),
    }
}

pub fn parse_ruleset(json: &str) -> Ruleset {
    serde_json::from_str(json).expect("ruleset parses")
}

pub fn os_check(rules: &Ruleset, opt: &OsOptions) -> bool {
    satisfies_ruleset(rules, opt, &[]).expect("eval ok")
}

pub fn feats_check(rules: &Ruleset, feats: &[&str]) -> bool {
    let owned: Vec<String> = feats.iter().map(|s| (*s).to_owned()).collect();
    satisfies_ruleset(rules, &linux(), &owned).expect("eval ok")
}

pub fn ok_check(rules: &Ruleset) -> bool {
    satisfies_ruleset(rules, &linux(), &[]).expect("eval ok")
}
