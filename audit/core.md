# Audit — `@torba/core`

Read-only code-quality audit, 2026-05-19. Findings only — nothing changed.

## HIGH

None. No broken abstractions, no leaky boundaries, no lying types of
consequence.

## MEDIUM

- [FIXED] **`lib/interpolate.ts:15,63` — `substitute` is a needless one-line wrapper
  exported under a second name.** `interpolate(template, vars)` only does
  `return substitute(template, vars)`, and `substitute` has no other caller.
  Inline `substitute` into `interpolate` and delete the private function.
- [FIXED] **`lib/interpolate.ts:13,43` — placeholder-replacement logic copy-pasted**
  between `substitute` and `resolveVars.resolve`. Both run the same
  `template.replace(PLACEHOLDER, …)` callback, differing only in the final
  lookup (`vars[name]` vs recursive `resolve(name)`). Extract one
  `replacePlaceholders(template, lookup)` helper.
- [FIXED] **`lib/integrity.ts` — asymmetric codec: `encodeIntegrity` exists but there
  is no `decodeIntegrity`.** Every other wire type ships a matching
  `decode`/`encode` pair; `artifact.ts:67` and `pointer.ts:46` consume
  `raw.integrity` by raw passthrough. `encodeIntegrity` also does
  array-collapsing (`i.length === 1 ? i[0]! : i`) with no `decode` counterpart.
  Add a trivial `decodeIntegrity` for symmetry, or move the normalization to
  callers.

## LOW

- [FIXED] **`lib/shorthand.ts:78-95` — `ShortRule` / `ShortRuleset` codec objects are
  dead weight.** They only re-bundle the four already-exported functions;
  nothing outside the package imports them (real consumers import
  `parseShortRuleset` directly). Drop the objects.
- [FIXED] **`lib/shorthand.ts:68` — `[raw as RawSingle]` cast** is unnecessary after
  `Array.isArray` narrowing.
- **`lib/artifact.ts:84` vs `:67` — inconsistent absent-field encode guards**
  (`.length > 0` vs truthy vs `!== undefined`) repeated across
  `manifest.ts` / `extract.ts` / `discovery.ts` / `pointer.ts`. Consistency
  note — a shared `compact`/`omitUndefined` helper if this grows.
- [FIXED] **`lib/manifest.ts:80-86` — `filterManifest` rebuilds the object
  field-by-field** when only `artifacts` changes; `{ ...u, artifacts: … }` is
  shorter and won't silently drop a future field.
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

Healthy. A clean, functional, well-documented spec package — pure decode/encode
functions, no incidental classes, no real `as unknown as` escapes, clear module
boundaries. Cleanup items are cosmetic. The `Val`/`ConditionalVal` duplication
is the one genuine "two things or one?" question, but it is a defensible spec
distinction that just needs a comment. Nothing here is urgent.
