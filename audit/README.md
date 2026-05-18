# torba code-quality audit — 2026-05-19

Read-only audit of every package's `lib/`, hunting for overcomplication,
reinvented wheels, messy code, and questionable design — judged against the
project's functional-FP goals (pure functions, total transforms, no incidental
classes, "parse, don't validate", clean module boundaries).

This is the **open** backlog. Resolved findings have been removed as they were
fixed (see git history); one file per package below.

## Per-package files

| File                               | What's left                                  |
| ---------------------------------- | -------------------------------------------- |
| [core.md](core.md)                 | 2 cosmetic LOW items                         |
| [mojang-rules.md](mojang-rules.md) | 1 totality wart (`satisfiesOs`) + polish     |
| [mojang.md](mojang.md)             | 1 real bug (`encodeMaven`) + consistency     |
| [dev.md](dev.md)                   | 3 LOW polish items                           |
| [minecraft.md](minecraft.md)       | `lwjgl3ify/template` casts + forge-family    |
| [java.md](java.md)                 | 2 low-stakes polish items                    |
| [runtime.md](runtime.md)           | download concurrency over-engineered         |
| [cli.md](cli.md)                   | `args.ts` wrapper + logger↔progress coupling |

## HIGH-priority items still open

| Package     | Finding                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| `mojang`    | `encodeMaven` is a lossy non-inverse of `parseMaven` (data loss, no error) |
| `runtime`   | weighted-budget download concurrency over-engineered (~70 lines)           |
| `runtime`   | `Budget` is the only incidental class left in the codebase                 |
| `minecraft` | `lwjgl3ify/template.ts` abandons zod for `as Record<string,unknown>`       |

## Cross-cutting themes still open

- **"Parse, don't validate" applied unevenly.** `mojang/client.ts` punts
  `arguments`/`libraries` to `z.unknown()`; `minecraft` cleanroom/lwjgl3ify
  parse installer JSON via `interface` + `as T`.
- **Bare `Error` vs structured errors.** `mojang` throws a structured
  `VersionFetchError` in one fetcher and a bare `Error` in `parseClient` /
  `fetchAssetManifest` / `latestRelease`. Pick one.
- **Hand-written interfaces vs `z.infer`.** `mojang` (`VersionManifest`,
  `Client`) and `minecraft` (four near-identical `*Template` interfaces) keep
  hand-maintained types beside schemas — drift risk.
- **Speculative generality.** `ArgItem`'s bare-`Val` arm (`dev`) and the
  `forgeWrapper` option (`minecraft`) carry surface no caller uses.

## Resolved batches (for context)

- The obvious, non-ambiguous findings across all 8 packages — fixed (commit
  `9ac2f5b`).
- Hand-rolled NBT encoder → `nbtify` (`minecraft`).
- The two glob dialects (`runtime` `matchesGlob` vs `core` `globToRegex`) are
  **deliberately kept** — each is the frozen semantics of a different manifest
  field; documented in `archive.ts` rather than merged.

## Notes — deliberate, not problems

`core`'s hand-rolled glob→regex and fetch-retry, and `dev`'s `userDataDir`,
are justified zero-dep choices for their packages. `@torba/runtime`'s tar
reader is being moved onto `tar-stream`.
