# unifest — project notes for AI agents

## What this is

A TypeScript/Bun monorepo that builds and launches Minecraft client installations from
declarative manifests (`unifest.json`). Two user-facing commands:

- `unifest build` — reads a JS config (`unifest.config.mjs`), fetches Minecraft metadata
  from Mojang, and emits a `unifest.json` manifest describing every file that must be
  present to run the game.
- `unifest launch` — installs everything described in the manifest, then spawns the JVM.

## Package layout

| Package              | Role                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `@unifest/rules`     | Pure platform/feature matching (OS name, arch, version). No I/O, no errors.                                  |
| `@unifest/core`      | Data model: `Unifest`, `Unifact`, `Source`, `Integrity`, `Extract`, `ValDefs`. Zod codecs for serialisation. |
| `@unifest/minecraft` | Parses Mojang's launcher manifest and per-version JSON into typed objects.                                   |
| `@unifest/mc`        | Converts a parsed Mojang `Client` into a `Unifest` template (libraries, assets, client jar).                 |
| `@unifest/installer` | Downloads, verifies, and extracts artifacts; spawns the game process.                                        |
| `cli`                | Thin entry point wiring `build` and `launch` commands to the packages above.                                 |

## Installer lifecycle

`install(source, options)` in `installer/lib/install.ts`:

Phases are strictly sequential. No integrity checking happens during download; no extraction
happens during or after download. Each phase is entirely separate.

```
PHASE 1 — resolve
  Read manifest from file, URL, or in-memory Unifest object.

PHASE 2 — download  (retry loop, max 3 attempts)
  ┌─────────────────────────────────────────────────────────────────────────────────┐
  │                                                                                 │
  │  a. scan — existsSync every artifact; skip files already on disk               │
  │                                                                                 │
  │  b. fetch — download missing files in parallel (default concurrency 32)        │
  │               each file: up to 3 HTTP attempts with linear backoff             │
  │               downloaded to a per-pid staging dir first, then renamed to final │
  │                                                                                 │
  │  c. verify — after ALL files are in place, check sha1/sha256 in one batch     │
  │               pass → done                                                      │
  │               fail, attempt < 3 → delete bad files, restart from (a)          │
  │               fail, attempt == 3 → throw IntegrityError                       │
  │                                                                                 │
  └─────────────────────────────────────────────────────────────────────────────────┘

PHASE 3 — extract  (only for artifacts freshly downloaded in this run)
  For each Unifact that has an ExtractDump rule AND was downloaded above:
    • if rule.clean: wipe the target directory first
    • mkdir target
    • unzip artifact → target (with include/exclude glob filters)
  Artifacts already on disk from a prior run are NOT re-extracted.

(staging dir cleaned up in finally regardless of outcome)
```

`launch(manifestPath, { install: false })` runs after `install()` and spawns the JVM.

## Error types

All typed errors are in `installer/lib/errors.ts` and exported from `@unifest/installer`:

| Class               | When                                                      | CLI exit code |
| ------------------- | --------------------------------------------------------- | ------------- |
| `NetworkError`      | HTTP failure during download or manifest fetch            | 2             |
| `IntegrityError`    | Files still failing hash check after 3 attempts           | 3             |
| `ExtractionError`   | ZIP extraction failure (wraps original error via `cause`) | 4             |
| `UsageError`        | Bad CLI args or missing required config fields            | 1             |
| `VersionFetchError` | Mojang API fetch failure (in `@unifest/minecraft`)        | 2             |

## Progress callback

`InstallOptions.onProgress` is a single callback receiving an `InstallProgress` discriminated union:

```ts
type InstallProgress =
  | { phase: 'resolve' }
  | {
      phase: 'download';
      fetched: number;
      total: number;
      skipped: number;
      file: string;
    }
  | { phase: 'verify' }
  | { phase: 'extract'; count: number };
```

`download` is emitted once with `fetched: 0` when the total is known, then once per
completed file. `file` is the final path of the downloaded artifact.

## Key design decisions

- **Extract only on fresh downloads.** `extractAll` is skipped entirely when all files were
  already on disk. This prevents redundant directory wipes (e.g. `natives/`) on every launch.
- **No Result<T,E> monad.** Typed `throw`/`catch` with class hierarchy is used instead —
  more idiomatic TypeScript.
- **Retry is a combinator.** `withRetry(fn, maxAttempts, backoff)` in `installer/lib/retry.ts`
  is used for per-file download retries; the integrity-cycle retry is a plain `for` loop.
- **`onProgress` is the only callback.** Phase transitions and per-file events go through the
  same typed callback so callers have one integration point.
