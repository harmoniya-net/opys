# Audit — `@opys/dev`

Code-quality audit, 2026-05-19 — open items only (resolved findings removed;
see git history).

## HIGH

None.

## MEDIUM

None.

## LOW

- **`lib/config.ts:8` / `lib/engine.ts:14-22` — `ArgItem`/`flattenArgs` accept
  a bare `Val` that no caller uses.** `args` accessors return
  `Valset | Val | string`, but the documented usage never produces a bare
  `Val`. Narrow `ArgItem` to `Valset | string` unless a plugin genuinely emits
  a bare `Val` launch group.
- **`lib/engine.ts:33-38` — plugin `build` hooks run with unbounded
  `Promise.all` concurrency.** Fine at current scale, but each plugin does
  network/fs I/O; worth a comment that the fan-out is intentional.

## Verdict

Good shape. Two minor LOW items remain — all polish, none structural.
