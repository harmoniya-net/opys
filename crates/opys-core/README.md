# opys-core

[![Crates.io](https://img.shields.io/crates/v/opys-core.svg)](https://crates.io/crates/opys-core)

Manifest data model + opys shorthand + `Val`/`Valset` — the reference
implementation of the opys manifest format.

```sh
cargo add opys-core
```

```rust
use opys_core::{filter_manifest, parse_manifest, OsOptions};

let m = parse_manifest(&std::fs::read_to_string("manifest.json")?)?;
let platform = OsOptions {
    name: "linux".into(),
    version: "6.12".into(),
    arch: "x86_64".into(),
};
let applicable = filter_manifest(&m, &platform, &[])?;
println!("{} artifacts apply to {}", applicable.artifacts.len(), platform.name);
```

The format is the contract — this crate is what a non-Rust reimplementation
would reimplement exactly. Other opys crates layer on top:

- [`opys-bundle`](https://crates.io/crates/opys-bundle) is the file a
  manifest is published as: a zip of it and the blobs it names.
- [`opys-runtime`](https://crates.io/crates/opys-runtime) consumes a
  bundle, or a `Manifest` and its blobs, and installs + launches it.
- [`opys-mojang-rules`](https://crates.io/crates/opys-mojang-rules) is
  the rule evaluator this crate depends on.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit.
