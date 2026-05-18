# Audit — `@torba/cli`

Read-only code-quality audit, 2026-05-19. Findings only — nothing changed.

## HIGH

- [FIXED] **`package.json` — dead `kolorist` dependency.** `kolorist` is declared but
  never imported anywhere in `lib/` or `bin/` — progress output uses raw
  `\x1b[…]` escapes (`progress.ts:108`) and the logger writes plain text. Drop
  the dependency, or use it (it would replace the hand-rolled escape codes).
- [FIXED] **`lib/commands/build.ts:19-30` & `lib/commands/launch.ts:25-30` —
  copy-pasted config loading.** Both commands independently do
  `resolve(inputFile)` → `dirname` → `import(pathToFileURL(...).href)` → check
  `mod.default` → `resolveConfig(mod.default, { mode })`. The single most
  leak-prone block in the CLI, duplicated verbatim. Extract a
  `loadConfig(inputFile, mode)` helper returning `{ config, configDir }`.

## MEDIUM

- **`lib/args.ts` (whole file) — the wrapper earns little over `node:util`.**
  It wraps `node:util.parseArgs` in a `FlagSpec[]` → `ParsedArgs` adapter, but
  the flag set is tiny (`input`, `output`, `mode` — all strings) and
  `extractGlobals` in `torba.ts` already bypasses the wrapper for the global
  flags. Its only real value-add is mapping the thrown error to `UsageError` —
  one try/catch. Consider calling `node:util.parseArgs` directly with a small
  `parse` helper.
- [FIXED] **`lib/args.ts:4,9,14,41` — `boolean` flag support is unused.** No command
  declares a `type: 'boolean'` flag; `getBoolean` is called only from
  `args.test.ts`. Premature generality kept alive by tests. Remove until a
  boolean flag exists.
- [FIXED] **`lib/args.ts:15` — `ParsedArgs.positional` is dead.** Neither `cmdBuild`
  nor `cmdLaunch` reads positionals (the command word is stripped in
  `torba.ts`). Unused surface area.
- [FIXED] **`bin/torba.ts:19` vs `build.ts:18` / `launch.ts:24` — the `--mode` default
  is a lie split two ways.** USAGE says "default: command name", but the
  default is a hardcoded string literal in each command (`'build'`,
  `'launch'`). A rename silently desyncs. Pass the command name from the
  dispatcher (`COMMANDS` already has it as the key).
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
- [FIXED] **`lib/commands/launch.ts:57-63` — the `render` throttle constant `80` is a
  magic literal** inline, unlike `progress.ts` which names its constants.
  Promote to a named const.

## Verdict

Good shape — genuinely a thin shell. The commands delegate all real work to
`@torba/dev`/`@torba/runtime`/`@torba/core`, exit-code mapping is centralized
in `bin/torba.ts`, and the functional split (pure `renderProgress`/`format*`
helpers vs. a thin stateful `ProgressWriter`) is sensible — the two classes are
the defensible kind of CLI state. The notable issues are a dead `kolorist`
dependency, one copy-pasted config-loading block crying out for a `loadConfig`
helper, and an `args.ts` wrapper that out-engineers its three-string-flag job
(boolean support and `positional` are dead weight).
