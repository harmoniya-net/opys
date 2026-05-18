# torba — Refactor

A ground-up restructure to a functional, plugin-based architecture. This
document is the **current architecture of record** — it describes what the
codebase _is_ after the refactor, plus the deviations and the work still
deferred. It is not a forward plan; treat every claim here as auditable
against the code.

## Goals

1. **Functional codebase** — pure functions, total transforms, no incidental
   classes, no shared mutable state.
2. **Clear public API / DX** — typed contracts; no hand-assembly footguns.
3. **No dirty workarounds** — every special-case is either justified in a
   comment or deleted.
4. **Modular & unit-testable** — pure pieces testable in isolation.

## Hard constraint

**The `torba.json` manifest format does not change.** Precisely: the public
schemas of `@torba/core` are frozen. Everything else — package layout, plugin
API, config shape, CLI flags — was free to break.

---

## 1. Package topology — 13 → 8

```
@torba/mojang-rules   Mojang-standard rule format (os/features/rule/ruleset).  leaf
@torba/mojang         Mojang protocol parsers (version JSON, libraries, …).  → core
@torba/core           Manifest data model + torba shorthand + Val/Valset.
                      The reference implementation of torba.json.      → mojang-rules
@torba/dev            Build SDK: defineConfig, the build engine, the plugin
                      contract, artifact overrides, userDataDir.             → core
@torba/runtime        install + launch executor.                       → core ONLY
@torba/minecraft      Minecraft-domain plugins — minecraft / forge / cleanroom
                      / lwjgl3ify / curseforge / authliberty — plus the
                      bifrost helper + internal JVM helpers.       → dev, core, mojang
@torba/java           OpenJDK provisioning plugin.                       → dev, core
@torba/cli            the `torba` binary.            → dev, runtime, minecraft, java
```

Clean DAG, no cycles. `@torba/mojang-rules` is a pure leaf consumed **only by
`core`**; `core` re-exports its rule surface so every other package depends on
`core` alone for rules. Removed: the standalone `rules`, `forge`, `cleanroom`,
`lwjgl3ify`, `curseforge`, `authliberty`, `bifrost` packages.

**Rule layering.** `mojang-rules` holds only the Mojang-standard rule format.
The torba **shorthand** (`'osx'` → `[{action:'allow',os:{name:'osx'}}]`) and
the rule-tagged-value primitive `Val`/`Valset` are torba's own flavor and live
in `core`. Rules follow **parse, don't validate**: a rule-bearing field accepts
shorthand _or_ a full ruleset on the wire; `decode` normalizes it to a full
`Ruleset`; the domain model never carries shorthand. There is exactly **one**
rule schema (`RuleSchema`) and **one** evaluator (`satisfiesRuleset`) in the
whole monorepo.

## 2. Architectural principles

- **`core` is the frozen manifest-format spec.** Its public schemas _are_ the
  contract; a non-TS reimplementation would reimplement exactly `core`.
- **`runtime` depends on `core` and nothing else** — a hard invariant, verified:
  `runtime/lib` imports only `@torba/core`, `fflate`, and `node:`. It is a
  clean rewrite target in another language.
- **`dev` and `runtime` never see each other.** `core` is the only plank across
  the build-time / runtime wall; they are joined solely by the frozen
  `torba.json`.

## 3. Plugin model — bundler-style

```ts
interface TorbaPlugin {
  name: string;
  build(ctx: BuildContext): Promise<Contribution> | Contribution;
}
interface BuildContext {
  log;
  configDir;
  mode;
}
interface Contribution {
  artifacts?: Artifact[];
  vars?: ValDefs;
  launch?: Record<string, Valset | Val | string>; // named launch groups
}
```

- **Pure to construct.** `forge('1.20.1-best')` builds `{ name, build }` with
  zero I/O; all network/fs work happens inside `build`, which the engine drives.
- **`build` is the only hook.** Build-phase only — plugins never run at launch.
- **`definePlugin`** is an identity helper for authoring a plugin.
- Filtering (`overrides`) is _not_ auto-wired into every plugin — see §11.

## 4. Config & composition

```js
import { defineConfig, userDataDir } from '@torba/dev';
import { forge } from '@torba/minecraft';
import { java } from '@torba/java';

export default defineConfig(({ mode }) => ({
  output: 'torba.json',
  plugins: [forge('1.20.1-best'), java('17')],
  manifest: {
    command: ({ java }) => java.bin, // -> '${java_bin}'
    args: ({ forge }) => [forge.jvmArgs, forge.mainClass, forge.gameArgs],
    workdir: '${game_directory}',
    envs: {},
    vars: { root: userDataDir('my-pack') }, // override layer
    artifacts: [], // literal-artifact escape hatch
    restrict: ['${game_directory}/mods/**/*.jar'],
  },
  runClient: (manifest) => ({ vars: { ...manifest.vars /* … */ } }),
}));
```

- Flat `plugins: []`; **no roles, no cardinality enforcement**.
- The engine merges artifacts (concat + last-wins dedup) and vars (plugin-list
  order, last-wins, **warn** on plugin-vs-plugin collision); the config `vars`
  field is the silent override layer.
- `command`/`args`/`workdir`/`envs` are author functions over a `PluginMap`
  keyed by plugin `name`. `args` is flattened (`Valset[] → Val[]`). The author
  owns order — `args` is mandatory, there is no role-based default. `PluginMap`
  is intentionally loosely typed (`Valset | Val | string` per key).
- **One var, one owner.** Base plugins emit no `java_home`/`java_bin`; the
  `java` plugin solely owns them (and `java_runtime_dir`).
- `mode` is a build-time-only `ctx` value (`torba build --mode X`).

## 5. Build lifecycle (`torba build`)

resolveConfig → run every plugin's `build(ctx)` in parallel → concat artifacts
(plugin output, then `manifest.artifacts`) → dedup last-wins by normalized path
→ merge vars → assemble `launch` via the author functions → `encodeManifest` →
write. Plugins log via `ctx.log`; the framework logs lifecycle.

## 6. `torba launch` & `runClient`

- `torba launch` reads `torba.json` **from disk** — it never rebuilds.
- **`runClient(manifest) => Partial<Manifest>`** is a launch-time manifest
  patch, re-run every launch (so `bifrost` mints a fresh token). The final
  manifest is `{ ...manifest, ...runClient(manifest) }` — uniform shallow
  per-field override.
- `runClient` is optional and CLI-side; `runtime` needs only `torba.json`.
- `bifrost` is a plain helper, not a plugin.

## 7. Artifact overrides & runtime feature flags

- **`ArtifactOverride`** (`@torba/dev`) — a `{ match, exclude?, rules?,
integrity? }` patch. `applyOverrides` runs an ordered list over an artifact
  set: drop, attach a ruleset (OS/feature gate), or clear integrity. This is
  build-time authoring machinery, so it lives in `dev`, not `core`.
- **`artifactScanner`** accepts an `overrides` option.
- **`install()`/`launch()`** accept `features?: string[]`, threaded through
  `scan`/`filterManifest`/launch resolution so `allow.features.*` artifact and
  arg rules activate. Supplied programmatically by the consuming UI client.

## 8. Workarounds eliminated

| Workaround                                                                            | Resolution                                                                        |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `as unknown as z.ZodType<T>` casts (manifest model)                                   | Wire schema + total `decode`; `parseX = decodeX(WireSchema.parse(…))`.            |
| Rule schema redefined 3× (mojang ×2, forge recipe) + evaluator (`satisfiesRulesImpl`) | One `RuleSchema` + `satisfiesRuleset` from `@torba/mojang-rules`.                 |
| `l.rules as unknown[]` casts (5×)                                                     | Gone — `mojang`'s `Library.rules` is a typed `Ruleset`.                           |
| `validateManifest`                                                                    | Deleted — typed `Contribution`/`args()` make its error class a compile error.     |
| `pipe` / `ArtifactPipe` class                                                         | Deleted — replaced by `ArtifactOverride`.                                         |
| `.cache` archive dir + 3 sweep/extract special-cases                                  | Deleted — archives are ordinary artifacts at a path disjoint from `extract.into`. |
| In-memory manifest rebuild at `torba launch`                                          | Deleted — launch reads `torba.json`.                                              |
| `--var` CLI flag + `pairs` arg machinery                                              | Deleted — all vars come from the config.                                          |
| `@deprecated SatisfiesOsOptions` alias                                                | Deleted.                                                                          |
| `runtime/lib/fs.ts` dead hash-verify duplication                                      | Deleted.                                                                          |

## 9. Per-package outcome

- **`mojang-rules`** — Mojang-standard rule format only; no casts.
- **`mojang`** — protocol parsers; rules typed via `core`.
- **`core`** — manifest data model, shorthand, `Val`/`Valset`; wire+decode.
- **`dev`** — `defineConfig`, build engine, plugin contract, `overrides`,
  `userDataDir`.
- **`runtime`** — install/launch; `core`-only deps; `.cache` removed; extract
  failures wrapped in `ExtractionError`.
- **`minecraft`** — all loader plugins + JVM helpers, internal.
- **`java`** — `java` plugin; owns `java_home`/`java_bin`/`java_runtime_dir`.
- **`cli`** — drives `dev` + `runtime`.

## 10. Verification

- All 8 packages build + typecheck clean; every unit suite passes.
- A vanilla `torba build` was run against live Mojang (3664 artifacts) and the
  resulting `torba.json` round-trips byte-stable through `parseManifest` /
  `encodeManifest`.
- **Not yet done:** a byte-diff of a full build against a pre-refactor
  reference (needs a network build of the complete config); `test:int`.

## 11. Deferred / known gaps

- **`defineArtifactPlugin` was not built.** Only `artifactScanner` honors
  `overrides`; `forge`/`curseforge`/etc. have no filter support. A combinator
  that wires `overrides` into every artifact-producing plugin is still open.
- **`fixPath`** (forge's `../libraries/` rewrite) still lives in the forge
  template, not the recipe-parse layer.
- **`MavenName`** in `mojang` is still a class — and a live one: it types
  `Library.name` and sits on the parse hot path. Migrating `libraries.ts` to
  the functional `MavenCoord` + `isNativeMaven` and deleting the class is an
  open Goal-1 (no incidental classes) item.
- **`minecraftTemplate`** and `resolveMinecraft` remain two names for one job
  (the duplicated fetch chain between them was collapsed).
- **No unit tests** for `@torba/minecraft` or `@torba/java`; `fetchWithRetry`
  in `core` is untested.
