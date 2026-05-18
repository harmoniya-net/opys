# Audit — `@torba/core`

Code-quality audit, 2026-05-19 — open items only (resolved findings removed;
see git history).

## HIGH

None.

## MEDIUM

None.

## LOW

- **`lib/artifact.ts:84` vs `:67` — inconsistent absent-field encode guards**
  (`.length > 0` vs truthy vs `!== undefined`) repeated across
  `manifest.ts` / `extract.ts` / `discovery.ts` / `pointer.ts`. Consistency
  note — a shared `compact`/`omitUndefined` helper if this grows.
- **`lib/val.ts` vs `lib/valdefs.ts` — two near-identical "rule-conditional
  value" models** (`Val` list-valued, `ConditionalVal` scalar) with duplicated
  parse/encode/resolve machinery. Defensible spec distinction — but it should
  carry a comment explaining why they are kept separate.

## Notes (not findings)

- Dep-light stance is deliberate and correct: `glob.ts` and `fetch.ts`
  hand-roll glob→regex and retry rather than pulling `picomatch` / `p-retry`.
  For a frozen spec package, the right call — both are well-scoped and tested.
- `fetch.ts`'s `isTransientFetchError` casts are appropriate for untyped error
  introspection. `artifact.ts metadata: unknown` is honest. `decodeDiscovery`
  being the identity is correctly labelled.

## Verdict

Healthy. Only two cosmetic LOW items remain.
