# opys-core

[![Crates.io](https://img.shields.io/crates/v/opys-core.svg)](https://crates.io/crates/opys-core)

Manifest data model + opys shorthand + `Val`/`Valset` — the reference
implementation of the frozen `opys.json` wire format.

```toml
[dependencies]
opys-core = "0.1"
```

```rust
use opys_core::{parse_manifest, filter_manifest, OsOptions};

let m = parse_manifest(include_str!("opys.json"))?;
let platform = OsOptions {
    name: "linux".into(),
    version: "6.12".into(),
    arch: "x86_64".into(),
};
let applicable = filter_manifest(&m, &platform, &[])?;
println!("{} artifacts apply to {}", applicable.artifacts.len(), platform.name);
```

The wire format is **frozen** — this crate is the contract a
non-Rust reimplementation would reimplement exactly. Other opys
crates layer on top:

- [`opys-runtime`](https://crates.io/crates/opys-runtime) consumes a
  `Manifest` and installs + launches it.
- [`opys-mojang-rules`](https://crates.io/crates/opys-mojang-rules) is
  the rule evaluator this crate depends on.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit.
