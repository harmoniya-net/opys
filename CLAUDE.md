# lanka

A declarative toolkit that **builds** and **launches** Minecraft installations
from a frozen `lanka.json` manifest. A config (`lanka.config.mjs`) composes
plugins into a manifest at build time; the runtime installs and launches it.

This file is the architecture of record — principles, structure, conventions.
Treat every claim here as auditable against the code.

## Principles

1. **Functional.** Pure functions, total transforms, no incidental classes, no
   shared mutable state. A `class` in a package's `lib/` is a smell — justify
   it in a comment or remove it.
2. **Parse, don't validate.** Every wire type has a zod schema plus a total
   `decode`/`encode` pair — `parseX = decodeX(XWireSchema.parse(input))`. No
   `as unknown as` casts; the domain model never carries wire-only shapes
   (e.g. rule shorthand) past `decode`.
3. **Typed contracts, no footguns.** The public API is typed end to end; a
   misuse should be a compile error, not a runtime check.
4. **No dirty workarounds.** Every special-case is justified in a comment or
   deleted.
5. **Modular & unit-testable.** Pure pieces tested in isolation; ~99% line
   coverage is the standing bar.

## Hard constraint

**The `lanka.json` manifest format is frozen.** `@lanka/core`'s public schemas
_are_ the contract — a non-TypeScript reimplementation would reimplement
exactly `core`. Package layout, plugin API, config shape, and CLI flags may all
change; the manifest wire format may not.

## Packages

Eight packages, a clean DAG, no cycles:

```
@lanka/mojang-rules  Mojang-standard rule format (os / features / rule / ruleset).  leaf
@lanka/mojang        Mojang protocol parsers (version JSON, libraries, assets, …).  → core
@lanka/core          Manifest data model + lanka shorthand + Val/Valset.
                     The reference implementation of lanka.json.           → mojang-rules
@lanka/dev           Build SDK: defineConfig, the build engine, the plugin contract,
                     artifact overrides, artifactScanner, userDataDir.             → core
@lanka/runtime       install + launch executor.                              → core ONLY
@lanka/minecraft     Minecraft-domain plugins — minecraft / forge / cleanroom /
                     lwjgl3ify / curseforge / authliberty — + bifrost / serverlist
                     helpers.                                         → dev, core, mojang
@lanka/java          OpenJDK (Adoptium) provisioning plugin.                  → dev, core
@lanka/cli           the `lanka` binary.                 → dev, runtime, minecraft, java
```

### Invariants

- **`core` is the frozen manifest spec.** Its schemas are the contract.
- **`runtime` depends on `core` alone** among `@lanka/*` — verified: `runtime/lib`
  imports only `@lanka/core`, a few tiny third-party libs (`fflate`,
  `tar-stream`), and `node:`. It is a clean reimplementation target.
- **`dev` and `runtime` never see each other.** `core` is the only plank across
  the build-time / runtime wall; they are joined solely by `lanka.json`.
- **One rule schema, one evaluator** — `RuleSchema` + `satisfiesRuleset`,
  monorepo-wide. `mojang-rules` holds only the Mojang-standard format; the
  lanka **shorthand** (`'osx'` → `[{action:'allow',os:{name:'osx'}}]`) and the
  rule-tagged-value primitives `Val`/`Valset` are lanka's own flavor, in `core`.

## Plugin model — bundler-style

```ts
interface LankaPlugin {
  name: string;
  build(ctx: BuildContext): Promise<Contribution> | Contribution;
}
interface Contribution {
  artifacts?: Artifact[];
  vars?: ValDefs;
  launch?: Record<string, Valset | Val | string>; // named launch groups
}
```

- **Pure to construct.** `forge('1.20.1-best')` returns `{ name, build }` with
  zero I/O; all network/fs work happens inside `build`.
- **`build` is the only hook** — build-phase only; plugins never run at launch.
- `definePlugin` is an identity helper; `defineArtifactPlugin` wraps a plugin
  so its artifacts run through `applyOverrides`.

## Config & composition

```js
export default defineConfig(({ mode }) => ({
  output: 'output.json',
  plugins: [forge('1.20.1-best'), java('17')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ forge }) => [forge.jvmArgs, forge.mainClass, forge.gameArgs],
    workdir: '${game_directory}',
  },
  // runClient runs on the LAUNCH machine, every launch — the only correct
  // place for machine-specific paths. `userDataDir()` resolves the *build*
  // machine's home dir, so it must NEVER go in `manifest.vars` (baked into
  // lanka.json); it belongs here.
  runClient: (manifest) => ({
    vars: { ...manifest.vars, root: userDataDir('my-pack') },
  }),
}));
```

- Flat `plugins: []` — no roles, no cardinality enforcement.
- The engine merges artifacts (concat + last-wins dedup by normalized path) and
  vars (plugin-list order, last-wins, **warns** on plugin-vs-plugin collision).
  `manifest.vars` is the silent override layer — but it is baked into
  `lanka.json`, so it takes build-time constants only, never machine-specific
  paths (those go in `runClient`).
- `command` / `args` / `workdir` / `envs` are author functions over a
  `PluginMap` keyed by plugin `name`. The author owns arg order — there is no
  role-based default.
- **One var, one owner.** e.g. only the `java` plugin emits
  `java_home` / `java_bin` / `java_runtime_dir`.
- `mode` is a build-time-only `ctx` value (`lanka build --mode X`).

## Build & launch

- **`lanka build`** — `resolveConfig` → run every plugin's `build(ctx)` in
  parallel → concat + dedup artifacts → merge vars → assemble `launch` via the
  author functions → `encodeManifest` → write.
- **`lanka launch`** — builds the manifest in-memory from the config and
  launches it directly; no `lanka.json` round-trip. `runClient(manifest) =>
Partial<Manifest>` is the launch-time patch, applied every launch (so e.g.
  `bifrost` mints a fresh token) as a shallow per-field override. The
  build/runtime wall holds — `cli` orchestrates `dev` + `runtime`, joined by
  the in-memory `Manifest`; a _deployed_ launcher instead feeds
  `@lanka/runtime` a frozen, published `lanka.json` with no `dev`.
- The runtime install pipeline is phased: resolve → pointer → discovery → scan
  → fetch → verify → extract → sweep. Failure is a discriminated union —
  `NetworkError` / `IntegrityError` / `ExtractionError`.

## Working in the repo

- npm workspaces. `npm run build` / `npm run typecheck` / `npm test` fan out
  across every package.
- **`npm test`** runs the unit suites (`tests/unit`). CI (`.gitlab-ci.yml`)
  runs `build` + `typecheck` + `test`; every `tsconfig` includes `tests/**`, so
  `typecheck` covers test code too.
- **`npm run test:int`** runs the live-network integration suite
  (`tests/integration`) against the real Mojang / Forge / Adoptium /
  CurseForge APIs. It needs network and a `CURSEFORGE_TOKEN`, so it is run
  **locally only** — never in CI.
- `audit/` holds the open code-quality backlog — one file per package, rated
  against the principles above. Keep it pruned: resolved findings are removed,
  not ticked.
