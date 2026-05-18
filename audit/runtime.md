# Audit — `@torba/runtime`

Code-quality audit, 2026-05-19 — open items only (resolved findings removed;
see git history).

## HIGH

- **`lib/phases/fetch.ts:114-158` — weighted-budget download concurrency is
  over-engineered for its payoff.** The `weight()` bucketing + the `Budget`
  weighted-semaphore class + LPT-style largest-first sort total ~70 lines of
  bespoke scheduling. A plain counting semaphore (N-at-a-time) downloads
  concurrently just fine; the stated benefit ("a single fat jar isn't split
  eight ways") is a micro-optimization — HTTP throughput is shared by the
  OS/TCP regardless. Replace with a simple fixed-concurrency worker pool; drop
  `weight`, `Budget`, and the LPT sort.
- **`lib/phases/fetch.ts:128-158` — `Budget` is an incidental class holding
  mutable state** (`used` + `waiters` with imperative `acquire`/`release`) —
  the only `class` in the codebase, against the functional-refactor goal. If a
  limiter is kept at all, a closure factory (`createLimiter(n)` returning
  `run<T>(fn)`) is the idiomatic functional form. (Resolved together with the
  finding above.)

## MEDIUM

- **`lib/install.ts:38-60` — extract-pending detection is split across
  phases.** `extractIsPending` re-implements an existence/emptiness scan inside
  `install.ts`, separate from `scan`'s skip logic and from `extractAll`'s
  marker writing — three places reason about "is this artifact's work done".
  Move `extractIsPending` into `phases/extract.ts` so all extract-state
  reasoning sits in one module.

## LOW

- **`lib/phases/fetch.ts:114-121` — `weight()`'s `1 * MB` is a no-op multiply**,
  and the buckets are only meaningful relative to the hard-coded default budget
  of 8 — `concurrency: 3` silently breaks the "huge runs alone" guarantee.
  Resolved by the HIGH finding.
- **`lib/install.ts:120-123,162` — `ScanTask` re-shaped into `{finalPath,
artifact}` twice.** `FetchTask`, `ExtractTask`, and verify's inline param are
  all structurally `{finalPath, artifact}`. Consider one shared `ArtifactTask`.
- **`lib/archive.ts` — manual structural narrowing of `unknown` for an error
  `code`.** Node provides `NodeJS.ErrnoException`; a typed `errCode(err)`
  helper would read cleaner (the pattern recurs in `sweep.ts`).

## Verdict

Good health overall — genuinely functional in style, clean phase
decomposition, error types a tidy discriminated union. The one standout is the
download concurrency system (`weight`/`Budget`/LPT) — the only spot reaching
for generic machinery a plain semaphore would cover, and the only incidental
class left in the codebase.
