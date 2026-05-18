# Audit — `@torba/mojang-rules`

Read-only code-quality audit, 2026-05-19. Findings only — nothing changed.

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
- **`README.md:1,8,31,55,76` — README is for the wrong package.** It is titled
  `@torba/rules`, says `npm install @torba/rules`, and documents
  `ShortRule`/`ShortRuleset`/`parseShortRuleset` — which actually live in
  `core/lib/shorthand.ts`, not here. Rename to `@torba/mojang-rules`; drop the
  shorthand section (or note it lives in `@torba/core`).

## LOW

- **`lib/features.ts:11-13` — `feats.some(f => f === feature)` reinvents
  `Array.includes`.** `feats.includes(feature)` is the same thing, clearer.
- **`lib/os.ts:43` — `RegExp` recompiled on every `satisfiesOs` call.** Inside
  `satisfiesRuleset` over many artifacts this recompiles the same pattern
  repeatedly. Disappears if the MEDIUM fix moves compilation to decode.
- **`lib/os.ts:7-11` — `OsOptions.name`/`.arch` typed `string`, not
  `OsName`/`OsArch`.** A small lie that lets `satisfiesOs` compare against an
  arbitrary string and silently never match. (The README example even passes
  `arch: 'x64'`, not a valid `OsArch`.) Tighten the types and validate at the
  `process.platform` boundary.
- **`lib/ruleset.ts:17,19` — `emptyRuleset()` and `allowOsRuleset` have thin
  justification.** `emptyRuleset()` returns a fresh `[]`; a literal is as
  clear. `allowOsRuleset` has one real caller path. Borderline premature API
  surface for a leaf package.
- **`lib/rule.ts:16-19` / `RuleSchema:28-32` — the bare `{ action }` union arm
  is a structural subset of the constrained arms.** Decoding still works, but
  the overlap is subtle; add a comment or use `.strict()` on the constrained
  arms.

## Verdict

Healthy. A genuinely small, functional, well-factored leaf package — pure
predicates, one shared zod schema with no casts, sensible module split. The
one real wart is `satisfiesOs` throwing on a bad version regex, violating the
package's own totality contract; pushing regex validation into
`OsConstraintSchema` fixes that and the per-call recompilation. The README is
stale and points at a different package — user-facing documentation bug.
