# opys-mojang-rules

[![Crates.io](https://img.shields.io/crates/v/opys-mojang-rules.svg)](https://crates.io/crates/opys-mojang-rules)

Mojang-standard rule format (`os` / `features` / `MojangRule` / `MojangRuleset`) — the
allow/disallow evaluator that gates entries in a `version.json` manifest.
Pure, no I/O, and the only implementation: the `@opys/mojang-rules` npm
package carries the types and nothing else.

```sh
cargo add opys-mojang-rules
```

```rust
use opys_mojang_rules::{satisfies_ruleset, MojangRule, OsOptions, RuleAction};

let ruleset = vec![MojangRule::Os {
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
