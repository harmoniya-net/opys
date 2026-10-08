# opys-core

[![Crates.io](https://img.shields.io/crates/v/opys-core.svg)](https://crates.io/crates/opys-core)

Manifest data model + opys shorthand + `Val`/`Valset` + the bundle — the
reference implementation of the opys manifest format.

```sh
cargo add opys-core
```

```rust
use opys_core::{open_bundle, filter_manifest, OsOptions};

// A bundle is a zip: the manifest's head, its artifact list, and its blobs.
let bundle = open_bundle(std::fs::File::open("server.opys")?)?;
let m = bundle.manifest();
let platform = OsOptions {
    name: "linux".into(),
    version: "6.12".into(),
    arch: "x86_64".into(),
};
let applicable = filter_manifest(m, &platform, &[])?;
println!("{} artifacts apply to {}", applicable.artifacts.len(), platform.name);
```

`read_bundle_head` reads the head alone, whatever the bundle weighs, and
`write_bundle` writes one from a `Manifest` and a table of where its blobs
are. The format is the contract — this crate is what a non-Rust
reimplementation would reimplement exactly. Other opys
crates layer on top:

- [`opys-runtime`](https://crates.io/crates/opys-runtime) consumes a
  bundle, or a `Manifest` and its blobs, and installs + launches it.
- [`opys-mojang-rules`](https://crates.io/crates/opys-mojang-rules) is
  the rule evaluator this crate depends on.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit.
