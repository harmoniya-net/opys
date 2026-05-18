# torba code-quality audit — 2026-05-19

Read-only audit of every package's `lib/`, hunting for overcomplication,
reinvented wheels, messy code, and questionable design — judged against the
project's functional-FP goals (pure functions, total transforms, no incidental
classes, "parse, don't validate", clean module boundaries).

**Nothing was changed.** These files are a findings backlog. One file per
package; this index holds the summary and the cross-cutting themes.

## Per-package files

| File                               | Verdict                                                |
| ---------------------------------- | ------------------------------------------------------ |
| [core.md](core.md)                 | healthy — cosmetic items only                          |
| [mojang-rules.md](mojang-rules.md) | healthy — one totality wart                            |
| [mojang.md](mojang.md)             | good — one real bug (`encodeMaven`)                    |
| [dev.md](dev.md)                   | good — one latent bug (`configDir`)                    |
| [minecraft.md](minecraft.md)       | good — forge-family duplication + `lwjgl3ify/template` |
| [java.md](java.md)                 | good — polish only                                     |
| [runtime.md](runtime.md)           | good — download concurrency over-engineered            |
| [cli.md](cli.md)                   | good — thin shell; dead dep + dup                      |

## HIGH-priority items

| Package     | Finding                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------- |
| `mojang`    | `encodeMaven` is a lossy non-inverse of `parseMaven` (data loss, no error)                   |
| `runtime`   | weighted-budget download concurrency is over-engineered (~70 lines)                          |
| `runtime`   | `Budget` is the only incidental class left in the codebase                                   |
| `minecraft` | GitHub release-listing logic triplicated across forge-family                                 |
| `minecraft` | `lwjgl3ify/template.ts` abandons zod for `as Record<string,unknown>`                         |
| `cli`       | dead `kolorist` dependency                                                                   |
| `cli`       | config-loading copy-pasted verbatim across `build`/`launch`                                  |
| `dev`       | `artifactScanner` resolves `directory` against `process.cwd()`, not `configDir` (latent bug) |

## Cross-cutting themes

These show up in three or more packages and are best fixed as one pass each:

- **"Parse, don't validate" applied unevenly.** `mojang/client.ts` punts
  `arguments`/`libraries` to `z.unknown()`; `minecraft` cleanroom/lwjgl3ify
  parse installer JSON via `interface` + `as T`. The discipline is real but
  not uniform.
- **Bare `Error` vs structured errors.** `mojang` throws a structured
  `VersionFetchError` in one fetcher and a bare `Error` in `parseClient` /
  `fetchAssetManifest` / `latestRelease`. Pick one.
- **Hand-written interfaces vs `z.infer`.** `mojang` (`VersionManifest`,
  `Client`) and `minecraft` (four near-identical `*Template` interfaces) keep
  hand-maintained types beside schemas — drift risk.
- **One-line passthrough wrappers.** `substitute` (core), `mojangArgsToValset`
  (minecraft), `findVersion` (mojang) add a name and nothing else.
- **Premature generality / dead surface.** `args.ts` boolean+positional
  support (cli), unused `${var}` params in `minecraft/mappers/*`,
  `ScanTask.idx` (runtime), `ArgItem` bare-`Val` arm (dev), `forgeWrapper`
  options (minecraft).
- **Two glob dialects.** `runtime/zip.ts` hand-rolls a weaker `matchesGlob`
  while `core` already exports `globToRegex` — an `includes`/`excludes`
  pattern behaves differently in extract vs. restrict-sweep.

## Cleared — deliberate, not problems

The hand-rolled **tar reader** (`runtime`), **glob→regex** and **fetch retry**
(`core`), and **`userDataDir`** (`dev`) are all justified by the dependency
wall (`@torba/runtime` depends on `@torba/core` alone). Auditors confirmed
these are correct trade-offs, not reinvented wheels. `minecraft`'s hand-rolled
NBT encoder is borderline — acceptable if avoiding the dependency is conscious.
