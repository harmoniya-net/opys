# opys-napi

Internal crate — the one napi-rs cdylib of opys, producing the `@opys/binding`
N-API addon. Every crate with a JS surface is a module here and a namespace
in the addon. Not consumed by Rust callers; ships via npm.

Rust consumers depend on the crate they need, such as
[`opys-core`](https://crates.io/crates/opys-core). JS/TS consumers depend on
the `@opys/*` package of the same name.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit.
