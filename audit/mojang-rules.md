# Audit — `@torba/mojang-rules`

Code-quality audit, 2026-05-19 — open items only (resolved findings removed;
see git history).

## HIGH

None.

## MEDIUM

- **`lib/os.ts:34-51` — `satisfiesOs` throws, breaking purity / totality.**
  Every other function in the package is a total, exception-free predicate;
  `satisfiesOs` alone throws on a malformed `version` regex. This is "validate,
  don't parse" backwards — a bad regex is a data defect that should be caught
  when the rule is decoded, not at evaluation time deep inside
  `satisfiesRuleset`. Validate the `version` field is a compilable `RegExp` in
  `OsConstraintSchema` (`z.string().refine(…)` or `.transform` to a `RegExp`),
  so `satisfiesOs` can be total.

## LOW

- **`lib/os.ts:43` — `RegExp` recompiled on every `satisfiesOs` call.** Inside
  `satisfiesRuleset` over many artifacts this recompiles the same pattern
  repeatedly. Disappears if the MEDIUM fix moves compilation to decode.
- **`lib/os.ts:7-11` — `OsOptions.name`/`.arch` typed `string`, not
  `OsName`/`OsArch`.** A small lie that lets `satisfiesOs` compare against an
  arbitrary string and silently never match. Tighten the types and validate at
  the `process.platform` boundary.
- **`lib/ruleset.ts:17,19` — `emptyRuleset()` and `allowOsRuleset` have thin
  justification.** `emptyRuleset()` returns a fresh `[]`; a literal is as
  clear. `allowOsRuleset` has one real caller path. Borderline premature API
  surface for a leaf package.
- **`lib/rule.ts:16-19` / `RuleSchema:28-32` — the bare `{ action }` union arm
  is a structural subset of the constrained arms.** Decoding still works, but
  the overlap is subtle; add a comment or use `.strict()` on the constrained
  arms.

## Verdict

Healthy. One open wart — `satisfiesOs` throws on a bad version regex; pushing
regex validation into `OsConstraintSchema` would restore totality and remove
the per-call recompilation.
