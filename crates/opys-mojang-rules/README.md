# opys-mojang-rules

[![Crates.io](https://img.shields.io/crates/v/opys-mojang-rules.svg)](https://crates.io/crates/opys-mojang-rules)

Mojang-standard rule format (`os` / `features` / `Rule` / `Ruleset`) — the
allow/disallow evaluator that gates entries in a `version.json` manifest.
Pure Rust port of `@opys/mojang-rules`, no I/O.

```toml
[dependencies]
opys-mojang-rules = "0.1"
```

```rust
use opys_mojang_rules::{satisfies_ruleset, OsOptions, Rule, RuleAction};

let ruleset = vec![Rule::Os {
    action: RuleAction::Allow,
    os: opys_mojang_rules::OsConstraint {
        name: Some(opys_mojang_rules::OsName::Linux),
        version: None,
        arch: None,
    },
}];
let platform = OsOptions {
    name: "linux".into(),
    version: "6.12".into(),
    arch: "x86_64".into(),
};
assert!(satisfies_ruleset(&ruleset, &platform, &[]).unwrap());
```

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit.
