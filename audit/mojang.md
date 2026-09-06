# Audit — `opys-mojang` / `@opys/mojang`

Code-quality audit — open items only (resolved findings removed; see git
history).

The parsers moved to `crates/opys-mojang`; `@opys/mojang` is now a typed
wrapper over the napi addon. Line references below point at the crate.

## HIGH

- **`src/maven.rs:60-70` — `encode_maven` silently discards data; not a total
  inverse of `parse_maven`.** `MavenCoord.version` is `Option`, but
  `encode_maven` drops `packaging` unless `classifier` _and_ `version` are
  present, and drops `classifier` unless `version` is present. So
  `{group_id, artifact_id, classifier: "natives-linux"}` encodes to `g:a` —
  data loss with no error. Carried over deliberately: the flag it feeds
  (`Library.native`) lands in artifact `metadata`, which is frozen, so the
  behaviour could not change in the port. Fix by making `version` required, or
  by moving encoding off `Display` onto a fallible method.
  (`encode_maven_drops_incomplete_tails` enshrines the lossy behaviour.)

## MEDIUM

None.

## LOW

- **`VersionManifest::latest_release` has no in-repo consumer** outside the
  napi wrapper. Kept as public API surface; drop it if that stays true.
- **`packages/minecraft-vanilla/lib/mojang-fetch.ts:46` —
  `fetchAssetManifest` throws a bare `Error`** while its sibling
  `fetchVersionManifest` throws a structured `VersionFetchError`. Two fetchers,
  two error contracts. (Inherited when fetching moved out of `@opys/mojang`.)
- **Hand-written TS types mirror the Rust structs.** `packages/mojang/lib/index.ts`
  restates `Client`, `Library`, `Downloads`, … by hand, so Rust↔TS drift is
  possible. This is the established napi pattern here (`@opys/core` does the
  same), and the boundary tests in `packages/mojang/tests/unit/boundary.test.ts`
  cover the field names, but codegen would remove the class of bug entirely.

## Resolved by the Rust port

- `z.unknown()` deferral on `arguments`/`libraries` — every wire type now
  implements `Deserialize` (`#[serde(from/try_from)]`), so a client JSON
  decodes in one pass with no `serde_json::Value` intermediate and no bespoke
  `parse_*` functions.
- `parseClient` throwing a bare `Error` — now `MojangError::MissingArguments`.
- `extract: { exclude }` parsed but never read — dropped from the wire struct.
- **Wire-key bug**: `DownloadsSchema` declared `clientMappings` /
  `serverMappings` / `windowsServer` in camelCase, but Mojang sends them
  snake_case, so zod matched none of them and dropped all three on every
  version JSON. The Rust structs read the wire spelling and emit camelCase.
  No manifest impact — nothing reads anything but `downloads.client`.

## Verdict

One real bug (`encode_maven`), deliberately preserved because the frozen
manifest depends on its output. Everything else is polish.
