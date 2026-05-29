# opys-core-napi

Internal crate — napi-rs cdylib producing the `@opys/core-binding`
N-API addon. Not consumed by Rust callers; ships via npm.

Rust consumers should depend on
[`opys-core`](https://crates.io/crates/opys-core) directly.
JS/TS consumers should depend on
[`@opys/core`](https://www.npmjs.com/package/@opys/core).

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit.
