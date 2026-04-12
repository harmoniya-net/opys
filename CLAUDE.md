# unifest — project notes for AI agents

## What this is

A TypeScript monorepo that builds and launches Minecraft client installations from declarative manifests (`unifest.json`). Pure functional architecture — no OOP classes, discriminated unions instead of `instanceof`, side effects pushed to edges.

Two user-facing commands:

- `unifest build` — reads JS config, fetches Mojang metadata, emits `unifest.json`
- `unifest launch` — installs artifacts described in manifest, spawns JVM

## Package layout

| Package              | Role                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@unifest/rules`     | Pure platform/feature matching. POJOs + functions. `satisfiesRuleset(rules, os, feats)` etc.                                                                                                      |
| `@unifest/core`      | Data model as discriminated unions: `Source`, `Integrity`, `Size`, `ExtractRule`, `ValDefs`. Factory functions (`sourceUrl`, `extractDump`) instead of classes. Zod for parsing only — no codecs. |
| `@unifest/minecraft` | **Zero-binding module.** Pure Mojang JSON parsers. No dependencies on other unipack packages.                                                                                                     |
| `@unifest/mc`        | Bridge layer. Converts Mojang types to Unifest via pure mapper functions. Owns template creation.                                                                                                 |
| `@unifest/installer` | Downloads, verifies, extracts. Split into atomic phase modules. Side effects isolated to phase runners.                                                                                           |
| `cli`                | Entry point. Thin command handlers. Functional progress state reducer.                                                                                                                            |

## Data Model (Functional)

### `@unifest/rules` — Rule Evaluation

```ts
type RuleAction = 'allow' | 'disallow';
type Rule =
  | { action: RuleAction; os: OsConstraint }
  | { action: RuleAction; features: Record<string, boolean> }
  | { action: RuleAction };

type Ruleset = Rule[];

// Pure functions
function satisfiesRuleset(
  rules: Ruleset,
  os: OsOptions,
  feats?: string[],
): boolean;
function parseShortRuleset(raw: string | Rule | (string | Rule)[]): Ruleset;
function encodeShortRuleset(rules: Ruleset): unknown;
```

### `@unifest/core` — Core Types

```ts
// Discriminated unions with `kind` field
type Source = { kind: 'url'; url: string }
            | { kind: 'file'; file: string }
            | { kind: 'string'; string: string }
            | { kind: 'empty' }

type ExtractRule = { kind: 'pick'; file: string; into: string }
                 | { kind: 'scan'; matches: string; into: string; ... }
                 | { kind: 'dump'; into: string; clean?: boolean; ... }

// Factory functions (not classes)
const src: Source = sourceUrl('https://...')
const rule: ExtractRule = extractDump('natives/', { excludes: ['META-INF/'] })

// Parsing/encoding (no codecs)
function SourceSchema.parse(raw: unknown): Source
function encodeSource(s: Source): unknown
```

## Installer Lifecycle

`install(source, options)` at `installer/lib/install.ts`:

```
PHASE 1 — resolve
  └─ resolveManifest(): read file/URL/in-memory → Unifest

PHASE 2 — download (retry loop, max 3 attempts)
  └─ for attempt = 1..3:
       a. scan(manifest) → determine missing files (existsSync)
       b. fetchAll(tasks, vars, concurrency) → download to staging
       c. verifyAll(tasks) → batch hash check AFTER all files complete
          └─ pass → done
          └─ fail, attempt < 3 → delete bad files, restart scan
          └─ fail, attempt == 3 → throw IntegrityError

PHASE 3 — extract
  └─ extractAll(tasks, vars)
     └─ For each Unifact with `extract` rules that was freshly downloaded:
         • if rule.clean: rm target
         • mkdir target
         • unzip artifact → target

Note: Already-cached artifacts skip extraction entirely (prevents natives/ wipe on re-launch).
```

### Phase Modules

```
installer/lib/phases/
├── resolve.ts   — ManifestSource → Unifest
├── scan.ts      — existsSync check, returns ScanResult
├── fetch.ts     — Parallel download with semaphore
├── verify.ts    — Batch hash verification
└── extract.ts   — Zip extraction
```

Each phase is pure input→output. Side effects (fs, network) only in async runners.

## Error Types

| Class               | When                               | Exit Code |
| ------------------- | ---------------------------------- | --------- |
| `NetworkError`      | HTTP failure                       | 2         |
| `IntegrityError`    | Hash check failed after 3 attempts | 3         |
| `ExtractionError`   | ZIP extraction failure             | 4         |
| `UsageError`        | Bad CLI args                       | 1         |
| `VersionFetchError` | Mojang API fetch                   | 2         |

## Progress Type

```ts
type InstallProgress =
  | { phase: 'resolve' }
  | { phase: 'download'; fetched: number; total: number; skipped: number }
  | { phase: 'verify' }
  | { phase: 'extract'; count: number };
```

## Key Design Decisions

1. **Extract only fresh downloads.** Already-cached artifacts skip extraction.
2. **No `Result<T,E>` monad.** Typed exceptions for control flow.
3. **Pure functions over classes.** Data is POJO, behavior is standalone.
4. **Zero-binding `@unifest/minecraft`.** No deps on other unipack packages.
5. **Explicit parse/encode.** No `z.codec` — separate `parseXxx` and `encodeXxx` functions.
6. **Discriminated unions.** `kind` field replaces `instanceof` checks.

## Dependency Graph

```
cli → installer, mc, core
installer → core, rules
mc → minecraft, core, rules
core → rules
minecraft → (none / zod only)
rules → (zod only)
```

`@unifest/minecraft` is the leaf — Mojang data in, nothing else out.
