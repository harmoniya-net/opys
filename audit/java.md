# Audit — `@torba/java`

Code-quality audit, 2026-05-19 — open items only (resolved findings removed;
see git history).

## HIGH

None.

## MEDIUM

- **`template.ts:40-45` — `osArchRuleset` emits two separate rules where one
  combined `OsConstraint` works.** It produces
  `[{action:'allow',os:{name}}, {action:'allow',os:{arch}}]`. `core/lib/os.ts`
  documents that `{ name, arch }` together is allowed and `satisfiesOs` checks
  both. A single `[{ action:'allow', os:{ name, arch } }]` expresses the same
  AND with half the rules. If the two-rule split is a deliberate cross-package
  convention, leave it but add a comment.

## LOW

- **`template.ts:108-112` — `seenOses` then `release.binaries.find(...)`
  re-scans the binaries list per OS.** A single pass building a
  `Map<OsName, JavaPlatform>` is one pass and avoids the non-null `!`. Minor
  at 6 entries.

## Verdict

Good health — genuinely functional, types honest, clean module boundaries.
Only two low-stakes polish items remain.
