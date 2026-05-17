# torba — Refactor Plan

A ground-up restructure toward a functional, plugin-based architecture with
clear public contracts and no dirty workarounds.

## Goals

- **Functional codebase** — pure functions, total transforms, no incidental classes.
- **Clear public API / DX** — typed contracts, no hand-assembly footguns.
- **No dirty workarounds** — every special-case either justified or deleted.
- **Modular & unit-testable** — pure pieces testable in isolation (nice-to-have).

## Hard constraint

**The `torba.json` manifest format does not change.** Stated precisely: the
public schemas of `@torba/core` are frozen. Everything else — package layout,
plugin API, config shape, CLI flags — may break.

---

## 1. Package topology — 13 → 8

```
@torba/mojang-rules   Mojang-standard rule format + Val/Valset.            leaf
@torba/mojang         Mojang protocol parsers.                       → mojang-rules
@torba/core           Manifest data model + torba rule shorthand.
                      Reference impl of torba.json.                  → mojang-rules
@torba/dev            Plugin SDK + defineConfig + build engine.            → core
@torba/runtime        install + launch executor (was `installer`).         → core ONLY
@torba/minecraft      vanilla, forge, cleanroom, lwjgl3ify, curseforge,
                      authliberty, bifrost + internal JVM helpers.    → dev, core, mojang
@torba/java           JDK provisioning plugin.                             → dev, core
@torba/cli            the `torba` binary.               → dev, runtime, minecraft, java
```

Clean DAG, no cycles. Removed: `rules` (→ `mojang-rules`), and the standalone
`forge`/`cleanroom`/`lwjgl3ify`/`curseforge`/`authliberty`/`bifrost` packages
(→ folded into `@torba/minecraft`). `java` stays separate (JVM-runtime
provisioning is its own concern).

**Rule layering.** `mojang-rules` holds _only_ the Mojang-standard rule format
(`{action, os, features}`) plus `Val`/`Valset`. The torba **shorthand**
(`'osx'` → `[{action:'allow',os:{name:'osx'}}]`) is torba's own flavor — it
lives in `core`. `mojang-rules` is consumed only by `mojang` and `core`; plugin
authors get the rule surface (type, constructors, shorthand) re-exported from
`core`.

Rules follow **parse, don't validate**. The manifest wire form of a rule-bearing
field (`Artifact.rules`, etc.) accepts shorthand _or_ a full ruleset — and since
the format is frozen, the wire schema keeps accepting that union. `decode`
normalizes it to a full `Ruleset`: `parseShortRuleset` runs inside
`decodeArtifact`, never as a schema `.transform`. The domain model never carries
shorthand — working code only ever sees a normalized `Ruleset`.

## 2. Architectural principles

- **`core` is the frozen manifest-format spec.** Its public schemas _are_ the
  contract. A future non-TS implementation reimplements exactly this.
- **`runtime` depends on `core` and nothing else.** A hard invariant — it makes
  `runtime` a clean rewrite target in another language. Today's `installer`
  imports `@torba/rules` directly; the refactor routes every rule / `OsOptions`
  / platform need through `core` (re-exported or wrapped).
- **`dev` and `runtime` never see each other.** `core` is the only plank across
  the build-time / runtime wall. They are two independent tracks joined solely
  by the frozen `torba.json`.

## 3. Plugin model — bundler-style

A plugin is a plain object, exactly like a Rollup/Vite plugin:

```ts
interface TorbaPlugin {
  name: string;
  build(ctx: BuildContext): Promise<Contribution> | Contribution;
}

interface BuildContext {
  log: (scope: string, msg: string) => void; // sanctioned build-time logging
  configDir: string; // anchor for relative paths
  mode: string; // from `torba build --mode X`
}

interface Contribution {
  artifacts?: Artifact[];
  vars?: ValDefs;
  launch?: Record<string, Valset | string>; // named groups: jvmArgs, mainClass, bin, …
}
```

- **Pure to construct.** `forge('1.20.1-best')` builds `{ name, build }` and does
  zero I/O. All network/fs work happens inside `build(ctx)`, which the engine
  drives — so resolution is parallelizable, and `plugin.build(mockCtx)` is
  trivially unit-testable.
- **`build` is the only hook.** No `transform`, no `manifest`, no install hooks.
- **Build-phase only.** Plugins never run at `torba launch`.
- **`defineArtifactPlugin(name, build)`** — combinator that wraps a plugin,
  auto-applies `ArtifactFilters`, and auto-adds `exclude` (and `skipIntegrity`
  where relevant) to its option type. Every artifact-producing plugin uses it,
  so filter behavior is identical everywhere with zero copy-paste.

## 4. Config & composition

The config splits into **config-level** fields (`output`, `plugins`,
`runClient`) and a **`manifest: {}`** block holding everything that shapes the
output manifest — so manifest fields are visibly separate from tooling config.

```js
import { defineConfig } from '@torba/dev';
import {
  forge,
  authliberty,
  curseforge,
  artifactScanner,
  bifrost,
  userDataDir,
} from '@torba/minecraft';
import { java } from '@torba/java';

export default defineConfig(({ mode }) => ({
  output: 'torba.json',
  plugins: [
    forge('1.20.1-best'),
    java('17'),
    authliberty({
      version: '0.4',
      hosts: () => 'https://yggdrasil.harmoniya.net/',
    }),
    curseforge({
      token: '…',
      files: [
        /* ids / urls */
      ],
    }),
    artifactScanner({
      directory: './wizard',
      path: (f) => `\${root}/wizard/${f.rel}`,
      url: (f) => `https://cdn.example.com/wizard/${f.rel}`,
      hash: 'sha256',
      source: mode === 'local' ? 'file' : 'url',
    }),
  ],
  manifest: {
    command: ({ java }) => java.bin, // → '${java_bin}' literal
    args: ({ forge, authliberty }) => [
      authliberty.jvmArgs,
      forge.jvmArgs,
      forge.mainClass,
      forge.gameArgs,
    ],
    workdir: '${game_directory}',
    envs: {},
    vars: { root: userDataDir('harmoniya'), game_directory: '${root}/wizard' },
    artifacts: [
      /* optional hand-written literal Artifact[] */
    ],
    restrict: ['${game_directory}/mods/**/*.jar'],
  },
  runClient: (manifest) => ({
    vars: {
      ...manifest.vars,
      ...bifrost({
        privateKey: process.env.BIFROST_PRIVATE_KEY,
        username: 'Player',
        uuid: '00000000-0000-0000-0000-000000000000',
      }),
    },
  }),
}));
```

**Rules:**

- Flat `plugins: []`. **No roles, no cardinality enforcement** — uniform list.
- **`manifest.artifacts`** — a literal `Artifact[]` escape hatch, merged into the
  same artifact stream as plugin output (last-wins, so it can override a plugin's
  artifact by path). Most configs leave it empty.
- **`manifest.command`/`args`/`workdir`/`envs` are author functions** over a
  typed plugin accessor keyed by plugin `name`. The framework `.flat()`s the
  `args` result (`Valset[] → Val[]`). The author owns order; the accessor is
  typed, so a typo is a compile error. `command`/`args` are required;
  `workdir`/`envs` may be static values.
- **`command` returns a plain string** — e.g. `({ java }) => java.bin` yields the
  literal `'${java_bin}'`; OS-conditionality (`.exe`) lives in the `java_bin`
  _var_ the `java` plugin owns. `runtime` interpolates at launch.
- **Arg-groups are rule-aware `Valset`** (vanilla MC emits OS-conditional JVM
  args; the manifest's `launch.args` is `Val[]`).
- **Launch-arg ordering** is no longer a framework concern — there is no
  canonical-order engine. This keeps the model java-independent: a plugin's
  `launch` groups are just named buckets the author arranges.
- **`manifest.vars`** is the **override layer** (silent) on top of auto-merged
  plugin vars. Plugin-vs-plugin var collision emits a **build warning**
  (last-wins, plugin-list order); the config override is exempt.
- **One var, one owner.** Base plugins (vanilla/forge/cleanroom/lwjgl3ify) stop
  emitting `java_home`/`java_bin` defaults; the `java` plugin solely owns them.
  A config with no `java` plugin sets `command: () => 'java'` explicitly.

## 5. Build lifecycle (`torba build`)

```
1. resolveConfig             run the config function (cheap — plugins are pure)
2. build(ctx) per plugin     in parallel → Contribution[]
3. concat artifacts          plugin output, then manifest.artifacts
4. dedup artifacts           plugin-list order, last-wins by posix-normalized path
5. merge vars                last-wins; warn on plugin-vs-plugin collision
6. apply manifest.vars       override layer (silent)
7. assemble launch           manifest.command/args/workdir/envs author functions
8. encode → write torba.json
```

The framework logs lifecycle (`resolving N plugins…`, `merged N artifacts
(M deduped)`, var-collision warnings, `wrote torba.json`); plugins log via
`ctx.log`, auto-prefixed by `name`. Verbosity is CLI-controlled.

## 6. `torba launch` & `runClient`

- `torba launch` **reads `torba.json` from disk and never rebuilds.** It imports
  the config module only to obtain `runClient`; the `plugins` array sits inert
  (never `.build()`-ed → no network).
- **`runClient(manifest: Manifest) => Partial<Manifest>`** — a launch-time
  manifest patch. Single arg, no `ctx`. The final manifest handed to `runtime`
  is `{ ...manifest, ...runClient(manifest) }` — **uniform shallow per-field
  override**: a returned field replaces wholesale; spread `manifest.x` to retain
  and extend.
- `runClient` re-runs every launch → `bifrost` mints a fresh JWT, per-machine
  values (memory, local mods) are computed live and never baked into the
  shareable `torba.json`.
- `runClient` is **optional and CLI-side.** `runtime` needs only `torba.json`;
  a pure consumer shipping just the manifest gets the canonical install.
- `bifrost` is a **plain helper, not a plugin** (pure JWT mint), called inside
  `runClient`.
- **`--var` is removed.** All variables — launch-time included — come from the
  config (`manifest.vars`, `runClient`'s `vars`).

## 7. Workarounds eliminated

| Workaround                                                                                         | Resolution                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.cache` dir + 3 special-cases (`extractIsPending`, sweep `isTorbaInternal`, `pruneEmptyChildren`) | Archive becomes a normal artifact at a non-nested path, downloaded there and **kept** (enables re-extract without re-download). `@torba/java` template fixed: archive `path` and `extract.into` must be **disjoint**. New build-time check errors if `path` is inside any `extract.into`. All 3 special-cases deleted.                                                                                       |
| `validateManifest`                                                                                 | **Deleted.** Typed `Contribution` + typed `args()` accessor make its entire error class a compile error. Only validation left = zod parse at the `runtime` boundary.                                                                                                                                                                                                                                         |
| `as unknown as z.ZodType<T>` casts                                                                 | **Deleted.** zod schema validates the **wire** shape only (`z.infer` = wire type, no cast). A pure **total** `decode(wire) => domain` function does normalization ("parse, don't validate": `string\|string[] → string[]`, rule shorthand → full `Ruleset`, legacy `minecraftArguments → arguments`). `parseX = decodeX(WireSchema.parse(…))`; `encodeX` is the inverse. Wire types stay internal to `core`. |
| `l.rules as unknown[]` casts                                                                       | Gone — `mojang` depends on `mojang-rules` and parses a typed `Ruleset`.                                                                                                                                                                                                                                                                                                                                      |
| `fixPath` (`../libraries/` rewrite) in forge                                                       | Moved into forge's recipe-parse layer — done once, cleanly, not scattered.                                                                                                                                                                                                                                                                                                                                   |
| In-memory manifest rebuild at `torba launch`                                                       | **Deleted** — launch reads `torba.json`, full stop.                                                                                                                                                                                                                                                                                                                                                          |
| `pipe` / `ArtifactPipe` class                                                                      | **Deleted.** `.exclude`/`.skipIntegrity` become `ArtifactFilters` options on plugins via `defineArtifactPlugin`.                                                                                                                                                                                                                                                                                             |
| `.torba-extracted` marker                                                                          | **Kept** — legitimate extract-crash-safety. sweep ignores it by suffix-match (clean; unlike a magic dirname).                                                                                                                                                                                                                                                                                                |

## 8. ArtifactFilters

- `exclude?: Selector` — generic, on every artifact-producing plugin (wired by
  `defineArtifactPlugin`).
- `skipIntegrity?: Selector` — `artifactScanner` only; **selector-only**, no
  blanket boolean. Matching files emit `sourceUrl` with `integrity` omitted.
- `applyFilters(artifacts, filters)` — one pure util in `core`.
- `Selector = string | string[] | ((a: Artifact) => boolean)` — globs or predicate.

## 9. artifactScanner

- A plugin. `build(ctx)` walks `directory` (resolved against `ctx.configDir`),
  returns a **materialized `Artifact[]`** — the async generator and `pipe`'s
  drain machinery are gone.
- `path`/`url`: `string | ((f) => string)`. String form interpolates per-file
  placeholders `${rel}`/`${dir}`/`${filename}` at build time; real `${var}`s
  pass through to install.
- `source: 'file' | 'url'` — the author wires it via the config function's
  `mode` (`torba build --mode local` → file-source manifest).

## 10. Per-package outcome

- **`mojang-rules`** — today's `rules`, renamed and narrowed to the
  Mojang-standard rule format + `Val`/`Valset`. Shorthand removed (→ `core`).
- **`mojang`** — protocol parsers; depends on `mojang-rules`, emits typed
  `Ruleset`.
- **`core`** — lean manifest data model + torba rule shorthand. Wire schemas +
  total `decode`/`encode`. Re-exports the rule surface for `runtime` and plugins.
- **`dev`** — `defineConfig`, `TorbaPlugin`/`Contribution`/`BuildContext`,
  `defineArtifactPlugin`, `ArtifactFilters`/`applyFilters`, `Selector`, the build
  engine. Greenfield.
- **`runtime`** — today's `installer`, cleaned: `core`-only deps, `.cache`
  apparatus removed, marker logic simplified, no launch-rebuild.
- **`minecraft`** — vanilla + forge + cleanroom + lwjgl3ify + curseforge +
  authliberty + bifrost, each a plugin (bifrost a helper); JVM helpers
  (`buildClasspath`, `buildLaunch`, `mapLibraries`) as internal modules.
- **`java`** — `resolveJava` reshaped as a `{ name, build }` plugin.
- **`cli`** — drives `dev` (build) + `runtime` (install/launch); old
  `defineConfig`, `pipe`, `validateManifest`, `--var` removed.

## 11. Migration sequence

Two parallel tracks, joined only by the frozen format:

1. **Extract `mojang-rules`** — pull `rules` out, rename, narrow to the standard
   format, move shorthand to `core`, make `mojang` depend on it → the
   `l.rules as unknown[]` casts die. Small, isolated.
2. **Rewrite `core`** — wire schemas + total `decode`; kill `as unknown`. Public
   format surface unchanged, so `runtime` keeps working untouched.
3. **Clean `runtime`** — _(parallel track, any time after step 2)_ `.cache`
   removal, marker fix, `core`-only deps, drop launch-rebuild.
4. **Build `@torba/dev`** — the new plugin engine, greenfield.
5. **Port plugins** — one at a time to `{ name, build }` + `defineArtifactPlugin`,
   consolidating into `@torba/minecraft` + `@torba/java`.
6. **Cut over `cli`** — drive `dev` + `runtime`; delete old config path.
7. **Delete** the 8 obsolete template packages.

## 12. Execution — big-bang

The refactor is done on a **single branch and merged once, complete.** §11 is
the _work order on that branch_ (dependency order — `mojang-rules` before
`core` before `dev`, etc.), not a series of separate merges. The two tracks —
produce side and `runtime` — can be worked in parallel within the branch.

- No incremental cutover; `main` is replaced wholesale at the merge.
- Tests are written alongside each package as it lands on the branch — the new
  shapes are built for it (pure `decode`, total functions, `plugin.build(mockCtx)`,
  `applyFilters`).
- **The full suite must be green before the single merge.** That, plus a
  byte-level diff of the `torba.json` produced by the current `torba.config.mjs`
  against pre-refactor output, is the safety net that replaces incremental
  verification — it proves the frozen-format constraint held end to end.
