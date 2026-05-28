# Audit — `@torba/core`

Code-quality audit, refreshed post-Rust-port — open items only (resolved
findings removed; see git history).

The decode/encode/resolve/filter/interpolate/glob behaviors that were
previously the bulk of this package now live in the `torba-core` Rust
crate. `core/lib/index.ts` is a thin shim: typed wrappers around the
napi-rs binding plus hand-written sugar (factories, type guards,
`parseShortRuleset`, `parseValset`, `deduplicateArtifacts`).

## HIGH

None.

## MEDIUM

None.

## LOW

- **`lib/index.ts` — `parseShortRule` duplicates Rust shorthand parsing.**
  The Rust binding's `satisfiesRuleset` accepts shorthand directly, so
  the TS impl exists only for consumers that need expanded `Rule[]`
  objects. Two reasonable futures: (a) expose `expand_short_ruleset`
  from the binding and drop the TS impl, or (b) accept the duplication
  with a comment that points at the Rust source as the canonical
  definition of the shorthand grammar.
- **`lib/index.ts` re-exports both `RuleSchema` (zod) and the codegen'd
  binding types.** The zod schema is build-time-only (Forge recipe +
  Mojang client parsers). When/if zod is dropped, those consumers need
  an alternative validator. See `MIGRATION.md` "zod peer dependency".

## Notes (not findings)

- `fetch.ts` (build-time HTTP retry) intentionally stays in `@torba/core`
  rather than moving to `runtime` — the consumers (mojang/forge/java/
  curseforge plugins) can't depend on `@torba/runtime` per the
  build/runtime invariant.

## Verdict

Healthy and small. The shim does what a shim should — no domain logic
leaks past the napi boundary.
