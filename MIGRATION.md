# Rust port — migration plan

The Rust crates under `crates/` are the new source-of-truth for
`@opys/mojang-rules`, `@opys/core`, and `@opys/runtime`. The TS packages
are thin shims over napi-rs bindings.

## Current state

|                                                                     | Status      |
| ------------------------------------------------------------------- | ----------- |
| Cargo workspace (`Cargo.toml`, `rust-toolchain.toml`)               | ✅          |
| `crates/opys-mojang-rules` + tests (23 ✓)                           | ✅          |
| `crates/opys-core` + tests (64 ✓)                                   | ✅          |
| `crates/opys-runtime` + smoke tests (2 ✓)                           | ✅          |
| `crates/opys-core-napi` (cdylib)                                    | ✅ compiles |
| `crates/opys-runtime-napi` (cdylib)                                 | ✅ compiles |
| `core/lib/index.ts`, `runtime/lib/index.ts` napi-backed             | ✅          |
| Consumers (`dev`, `minecraft`, `java`, `cli`) on plain `@opys/core` | ✅          |
| npm prebuild distribution                                           | ⏳ pending  |
| Structured errors across napi (Q10)                                 | ⏳ pending  |

## Architecture notes

### Entry points

`@opys/core` and `@opys/runtime` each expose a single main entry. The
`/napi` subpath that existed during migration scaffolding has been removed
— consumers import from the package root.

### `fetch.ts` location

`core/lib/fetch.ts` stays in `@opys/core`. It's a build-time HTTP utility
consumed by `mojang`, `forge`, `curseforge`, `authliberty`, and `java` —
none of which can depend on `@opys/runtime` (CLAUDE.md invariant: dev
and runtime never see each other). The Rust runtime crate has its own
HTTP retry layer for the install pipeline; the TS-side `fetchWithRetry`
serves build-time consumers.

### zod peer dependency

`zod` remains a peer dependency of `@opys/core`. `RuleSchema` /
`OsNameSchema` are zod schemas used by the Forge recipe parser and the
Mojang client argument/library parsers for validating upstream JSON.
These are build-time only — the manifest contract itself doesn't need
zod (the napi binding does its own serde validation).

### Error narrowing

`runtime/lib/index.ts` keeps the `NetworkError` / `IntegrityError` /
`ExtractionError` classes as a compat shim. The Rust bridge currently
throws `napi::Error::from_reason(msg)`; `translateError` parses the
message and rewraps into these classes so `instanceof` checks keep
working. Q10's `code`-discriminant model (single `OpysErrorInfo` with
typed `details`) is the follow-up — once the Rust side emits structured
errors, the classes either grow a `code` field or get replaced.

## Architecture invariants preserved

- **`opys-core` depends only on `opys-mojang-rules`** — same DAG as JS.
- **`opys-runtime` depends only on `opys-core`** (plus tokio, reqwest,
  archive crates) — runtime is still a clean re-implementation target.
- **`build_launch` (pure spawn-spec) is separate from `launch` (spawns)** —
  Q5 in the design doc.
- **`download:bytes` events throttled ~50ms** before crossing TSFN — Q6.
- **Custom `matches_glob` for extract-rule includes/excludes stayed local**
  — frozen semantics, not unified with `glob_to_regex` (which backs
  `restrict`).

## Next steps

### 1. CI: prebuild matrix

The napi `package.json` lists 5 targets. CI cross-compiles each, uploads
`.node` files, then the npm publish step ships them as optional
dependencies (the napi `index.js` loader resolves the right one at
require-time).

### 2. Structured errors (Q10)

Replace `napi::Error::from_reason(msg)` in the napi crates with typed
errors that carry a `code` field (`NETWORK` / `INTEGRITY` /
`EXTRACTION`) and reason-specific details. Then drop the message-parsing
in `runtime/lib/index.ts` `translateError` and either retire the compat
classes or have them carry the same `code` for unified narrowing.
