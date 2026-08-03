# Audit — `@opys/java`

Code-quality audit, 2026-08-03 — open items only (resolved findings removed;
see git history).

## HIGH

None.

## MEDIUM

- **`template.ts:44-47` — `osArchRuleset` emits two separate rules where one
  combined `OsConstraint` works.** It produces
  `[{action:'allow',os:{name}}, {action:'allow',os:{arch}}]`. `core/lib/os.ts`
  documents that `{ name, arch }` together is allowed and `satisfiesOs` checks
  both. A single `[{ action:'allow', os:{ name, arch } }]` expresses the same
  AND with half the rules. If the two-rule split is a deliberate cross-package
  convention, leave it but add a comment.

## LOW

None.

## Verdict

Good health — genuinely functional, types honest, clean module boundaries.
The package now dispatches across three vendor resolvers (`temurin.ts`,
`zulu.ts`, `graalvm.ts`) behind a shared `VendorRelease`/`VendorBinary`
contract (`vendor.ts`) with no vendor-specific branching left in
`template.ts` — extraction always glob-strips the archive's own top-level
directory (a `'*/'`-glob `strip` rule, resolved by `core`/the runtime layer)
rather than special-casing the one vendor (GraalVM CE) whose directory name
isn't knowable at resolve time. Only one low-stakes polish item remains.
