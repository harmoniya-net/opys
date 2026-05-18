# Audit — `@torba/cli`

Code-quality audit, 2026-05-19 — open items only (resolved findings removed;
see git history).

## HIGH

None.

## MEDIUM

- **`lib/args.ts` (whole file) — the wrapper earns little over `node:util`.**
  It wraps `node:util.parseArgs` in a `FlagSpec[]` → `ParsedArgs` adapter, but
  the flag set is tiny (`input`, `output`, `mode` — all strings) and
  `extractGlobals` in `torba.ts` already bypasses the wrapper for the global
  flags. Its only real value-add is mapping the thrown error to `UsageError` —
  one try/catch. Consider calling `node:util.parseArgs` directly with a small
  `parse` helper.
- **`lib/logger.ts:24-67` + `lib/progress.ts:98-156` — two cooperating
  stateful classes with a back-reference.** `Logger.setProgressWriter` wires a
  mutable `pw?` field so logging can call `pw.clear()/redraw()`. Some CLI state
  is acceptable; the bidirectional coupling (logger reaches into the writer) is
  the leaky part. A single "console" object owning both stderr concerns would
  remove the `setProgressWriter` mutation step.

## LOW

- **`lib/progress.ts:141-144` — `ProgressWriter.log` duplicates the "clear then
  write line" path that `Logger.emit` also does.** Route launch's `pw.log(...)`
  status messages through `logger.info` for one consistent path.
- **`bin/torba.ts:104-118` — the fallback error handler prints two stacks**
  (`err.cause.stack` then `err.stack`), each gated on `TORBA_QUIET`. Verbose;
  a single stack usually suffices.
- **`lib/progress.ts:12-15` — `formatSpeed` thresholds at 1000, `formatBytes`
  at 1024.** Cosmetic inconsistency.

## Verdict

Good shape — a genuinely thin shell over the library packages. What remains is
the `args.ts` wrapper (now smaller after the dead-code removal, still arguably
more than its three string flags need) and the logger↔progress coupling.
