# Audit — `@torba/runtime`

Read-only code-quality audit, 2026-05-19. Findings only — nothing changed.

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
  `run<T>(fn)`) is the idiomatic functional form.

## MEDIUM

- [FIXED] **`lib/zip.ts` (whole file) — the filename lies about contents.** `zip.ts` is
  the unified extractor for both zip _and_ tar (`readArchive` dispatches on
  `isTarPath`). Rename to `archive.ts`, and `extractZip`/`extractZipPick` to
  `extractArchive`/`extractArchivePick`.
- [WONTFIX] **`lib/zip.ts:6-14` — hand-rolled `matchesGlob` duplicates a capability
  already in `@torba/core`.** `core` exports `globToRegex` (used by
  `sweep.ts`), but `zip.ts` reimplements a weaker matcher (only prefix/suffix
  `*`; no `**`, `?`, `{}`). Two glob dialects in one package is a real
  footgun — an `includes`/`excludes` pattern behaves differently in extract vs.
  restrict-sweep. Not justified by the dependency wall: `core` is the one
  allowed dependency and already has the better implementation. Use it.
  Resolution: kept. The two dialects are the frozen semantics of two
  different manifest fields — `extract` includes/excludes (trailing `/` =
  subtree) vs `restrict` globs — so unifying them would change one field's
  meaning. Documented the distinction in `archive.ts` instead.
- [FIXED] **`lib/phases/scan.ts:7-11,41` — `ScanTask.idx` is a dead field.** Populated
  but never consumed (`install.ts` drops it when mapping to `FetchTask`); the
  only reader is `scan.test.ts`. Remove it.
- **`lib/install.ts:38-60` — extract-pending detection is split across
  phases.** `extractIsPending` re-implements an existence/emptiness scan inside
  `install.ts`, separate from `scan`'s skip logic and from `extractAll`'s
  marker writing — three places reason about "is this artifact's work done".
  Move `extractIsPending` into `phases/extract.ts` so all extract-state
  reasoning sits in one module.
- [FIXED] **`lib/phases/verify.ts:25-41` — `Promise.any` + throw-to-reject is a
  clever-but-fragile way to express "any hash matches".** (The recent fix made
  it _correct_ — non-matching entries now reject — but the shape is still
  subtle.) A plain `Promise.all(...).then(r => r.some(Boolean))` is total and
  obvious and avoids the `AggregateError` catch.

## LOW

- **`lib/phases/fetch.ts:114-121` — `weight()`'s `1 * MB` is a no-op multiply**,
  and the buckets are only meaningful relative to the hard-coded default budget
  of 8 — `concurrency: 3` silently breaks the "huge runs alone" guarantee.
  Resolved by the HIGH finding.
- [FIXED] **`lib/zip.ts:61-63,126-128` — executable-bit logic copy-pasted** between
  `writeEntry` and `extractZipPick`. Extract `applyMode(path, mode)`.
- **`lib/install.ts:120-123,162` — `ScanTask` re-shaped into `{finalPath,
artifact}` twice.** `FetchTask`, `ExtractTask`, and verify's inline param are
  all structurally `{finalPath, artifact}`. Consider one shared `ArtifactTask`.
- **`lib/zip.ts:71-84` — manual structural narrowing of `unknown` for an error
  `code`.** Node provides `NodeJS.ErrnoException`; a typed `errCode(err)`
  helper would read cleaner (the pattern recurs in `sweep.ts`).
- [FIXED] **`lib/phases/extract.ts:36` — redundant `if (artifact.extract)` guard.**
  `extractAll:21` already `continue`s when it is absent.

## Verdict

Good health overall — genuinely functional in style (phases are pure-ish
transforms, manifests rebuilt immutably, `Promise.all` over `.map`
throughout), clean phase decomposition, error types a tidy discriminated
union. The hand-rolled `tar` reader is well-scoped and **justified** by the
dependency wall (`fflate` has no tar support; ~110 lines, clearly commented).
The standout problem is the download concurrency system — the
`weight`/`Budget`/LPT trio is the one place the package reaches for generic
machinery a plain semaphore would cover, and it drags in the only incidental
class in the codebase. Secondary: a duplicated glob dialect that should reuse
`@torba/core`, a mis-named file, a dead `idx` field, and extract-recovery logic
that leaked out of its phase.
