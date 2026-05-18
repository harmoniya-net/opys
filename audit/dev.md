# Audit — `@torba/dev`

Read-only code-quality audit, 2026-05-19. Findings only — nothing changed.

## HIGH

None.

## MEDIUM

- [FIXED] **`lib/scanner.ts:30,97` — `directory` is resolved against `process.cwd()`,
  not `configDir`.** Every other path anchors to `BuildContext.configDir` (the
  directory of `torba.config.mjs`). `scanDirectory` calls
  `walkDir(options.directory)` with no anchoring, and `build(ctx)` ignores
  `ctx.configDir`. A config run from a different cwd silently scans the wrong
  (or no) directory. Resolve `options.directory` against `ctx.configDir`
  inside `build`. **(Latent correctness bug.)**
- [FIXED] **`lib/scanner.ts:48-52` vs `9-19` — two near-duplicate file structs.**
  `FileEntry` (`rel/abs/size`) and `ScannedFile` (`rel/dir/filename/abs`)
  describe the same file twice; `scanDirectory` derives one from the other
  field by field. Drop `FileEntry`; have `walkDir` produce `ScannedFile`
  directly and carry `size` alongside.
- [FIXED] **`lib/scanner.ts:82-90,26` — `${abs}` is interpolatable but undocumented and
  probably a leak.** `applyTemplate` exposes `${abs}` (the build machine's
  absolute path) into `path`/`url` templates, but the `ScanTemplate` doc only
  advertises `${rel}`/`${dir}`/`${filename}`. Baking a build-machine absolute
  path into a manifest is almost never correct. Drop `abs` from the
  `interpolate` var map (keep it on `ScannedFile` for the function form), or
  document it deliberately.

## LOW

- **`lib/overrides.ts:49-50` — `integrity?: null` is a type that lies about
  intent.** The field can only ever be `null` ("clear integrity + discovery").
  A `null`-only field reads as a mistake. Replace with a boolean like
  `clearIntegrity?: true`.
- **`lib/config.ts:8` / `lib/engine.ts:14-22` — `ArgItem`/`flattenArgs` accept
  a bare `Val` that no caller uses.** `args` accessors return
  `Valset | Val | string`, but the documented usage never produces a bare
  `Val`. Narrow `ArgItem` to `Valset | string` unless a plugin genuinely emits
  a bare `Val` launch group.
- **`lib/engine.ts:33-38` — plugin `build` hooks run with unbounded
  `Promise.all` concurrency.** Fine at current scale, but each plugin does
  network/fs I/O; worth a comment that the fan-out is intentional.
- [FIXED] **`lib/scanner.ts:114` — stray bare `let source;`** with an inferred union
  type; `let source: Source` would document intent.

## Verdict

Good shape and lives up to the refactor's goals: small sets of pure functions,
a plugin contract that is genuinely pure-to-construct with all I/O confined to
`build`, no incidental classes, clean and well-documented module boundaries.
The only real defect is the scanner ignoring `configDir` (a path-resolution
bug waiting to bite), followed by the duplicated file structs and the leaky
`${abs}` placeholder. `userDataDir` is hand-rolled but that is a deliberate,
correct 9-line OS-convention function. Nothing is over-engineered.
