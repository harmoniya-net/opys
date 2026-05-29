# opys-runtime-napi

Internal crate — napi-rs cdylib producing the `@opys/runtime-binding`
N-API addon. Not consumed by Rust callers; ships via npm.

Rust consumers should depend on
[`opys-runtime`](https://crates.io/crates/opys-runtime) directly.
JS/TS consumers should depend on
[`@opys/runtime`](https://www.npmjs.com/package/@opys/runtime).

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit.
