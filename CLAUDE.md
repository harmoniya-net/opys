# opys

A declarative toolkit that **builds** and **launches** Minecraft installations
from a frozen `opys.json` manifest. A config (`opys.config.mjs`) composes
plugins into a manifest at build time; the runtime installs and launches it.

This file is the architecture of record — principles, structure, conventions.
Treat every claim here as auditable against the code.

## Principles

1. **Functional.** Pure functions, total transforms, no incidental classes, no
   shared mutable state. A `class` in a package's `lib/` is a smell — justify
   it in a comment or remove it.
2. **Parse, don't validate.** Every domain type de/serializes itself
   (`#[serde(try_from = "…Wire", into = "…Wire")]`), normalizing as it
   decodes. A `…Wire` type is `pub(crate)`, lives in the one file that owns
   its domain type, and exists for nothing but that decode — no consumer,
   Rust or JS, ever names one. No `as unknown as` casts.

   **Shorthand is not wire.** `'allow.os.osx'` is a first-class way to write a
   rule _in a manifest_, not a transitional spelling on the way to a real one.
   Hence the naming: `Rule` / `Ruleset` (in `core`) are how a rule is written
   and admit both spellings; `MojangRule` / `MojangRuleset` (in
   `mojang-rules`) are the expanded form they parse into, and the only form
   the evaluator sees. The TS types mirror the first — an author writing
   `rules: 'allow.os.linux'` must typecheck.

3. **Typed contracts, no footguns.** The public API is typed end to end; a
   misuse should be a compile error, not a runtime check.
4. **No dirty workarounds.** Every special-case is justified in a comment or
   deleted.
5. **Modular & unit-testable.** Pure pieces tested in isolation; ~99% line
   coverage is the standing bar.

## Hard constraint

**The `opys.json` manifest format is frozen.** `@opys/core`'s public schemas
_are_ the contract — a non-TypeScript reimplementation would reimplement
exactly `core`. Package layout, plugin API, config shape, and CLI flags may all
change; the manifest wire format may not.

## Packages

Eight packages, a clean DAG, no cycles:

```
@opys/mojang-rules  Mojang-standard rule format — MojangRule / MojangRuleset.   leaf
@opys/mojang        Mojang protocol parsers (version JSON, libraries, assets, …).
                     Thin wrapper over the `opys-mojang` crate. → mojang-rules
@opys/core          Manifest data model + opys shorthand + Val/Valset.
                     The reference implementation of opys.json.           → mojang-rules
@opys/dev           Build SDK: defineConfig, the build engine, the plugin contract,
                     artifact overrides, artifactScanner, userDataDir.
                     The contribution merge is the `opys-dev` crate.               → core
@opys/runtime       install + launch executor.                              → core ONLY
@opys/minecraft     Minecraft-domain plugins — minecraft / forge / fabric /
                     cleanroom / lwjgl3ify / curseforge / authliberty — + bifrost /
                     serverlist helpers. Vanilla, fabric and forge are thin wrappers
                     over the `opys-minecraft-vanilla`, `opys-fabric` and `opys-forge`
                     crates, each with its own `.node`; the remaining loaders get a
                     crate and a binding apiece on top of vanilla. → dev, core, mojang
@opys/java          JDK provisioning — Temurin / Zulu / GraalVM CE.
                     Thin wrapper over the `opys-java` crate.                → dev, core
@opys/cli           the `opys` binary.                 → dev, runtime, minecraft, java
```

### Invariants

- **`core` is the frozen manifest spec.** Its schemas are the contract.
- **`core` holds only what _both_ sides need.** A contract named by build-time
  alone — `Contribution`, the plugin output — belongs in `dev`; one named by
  runtime alone belongs in `runtime`. `core` is the intersection, not the union.
- **The TS types describe the manifest, not the Rust domain** (see principle
  2). That is why `Source` and `ExtractRule` are discriminated by which field
  is present rather than by a `kind` tag — a tag with no counterpart in the
  format is a second spelling waiting to drift — and why `Artifact.rules` is
  optional and accepts shorthand, and `Val` is `string | { rules?, value }`:
  the format has always allowed both, so a type that doesn't is simply wrong.
  Read a `Val` with `valValues`, never `.value`.
- **A domain type that crosses napi round-trips.** What it serialises to is
  what it deserialises from, because a loader gets a `Client` back from
  `fetchClient` and hands it straight to `clientToTemplate`. Reading a
  _foreign_ spelling is therefore a named operation —
  `Client::from_version_json`, not a `Deserialize` impl — so the wire type
  stays the one-way decode principle 2 describes.
- **Nothing that produces manifest artifacts iterates a `HashMap`.** An
  artifact list must not reorder between two builds of the same version, so
  the version JSON's `natives` / `classifiers` maps and the asset manifest's
  `objects` are `BTreeMap`s. Both were `HashMap`s and both made `opys.json`
  differ run to run.
- **`runtime` depends on `core` alone** among `@opys/*` — verified: `runtime/lib`
  imports only `@opys/core`, a few tiny third-party libs (`fflate`,
  `tar-stream`), and `node:`. It is a clean reimplementation target.
- **`dev` and `runtime` never see each other.** `core` is the only plank across
  the build-time / runtime wall; they are joined solely by `opys.json`.
- **One rule format, one implementation** — the `opys-mojang-rules` crate owns
  `MojangRule` / `MojangRuleset` and is its only implementation. It reaches JS
  through two addons with deliberately different contracts: `@opys/mojang`
  exposes it **strictly**, while `@opys/core` first expands the shorthand
  (`'allow.os.osx'` → `[{action:'allow',os:{name:'osx'}}]`) and so accepts
  either spelling. `Rule` / `Ruleset` — the manifest spelling — and the
  rule-tagged-value primitives `Val`/`Valset` are opys's own, in `core`.
- **One version-JSON mapping, one implementation.** `opys-minecraft-vanilla`'s
  mappers — client jar, libraries, assets, classpath, launch — are the shared
  half of the loader family. Forge, fabric, neoforge, cleanroom and lwjgl3ify
  each resolve a version JSON their own way and then call the same mappers, so
  a fix to the natives dump rule or the per-OS classpath lands once. Each is
  its own crate on top of `opys-minecraft-vanilla`.
- **One `inheritsFrom` merge, one implementation.** A loader's version document
  is a `VersionPatch` (in `opys-mojang`), and folding one onto the base version
  is `patch_to_template`. The rules it records are the format's, not any
  loader's, and each was checked against two independent readers — HMCL's
  `Lang.merge(this.libraries, parent.libraries)` and `minecraft-launcher-lib`'s
  `inherit_json`:
  - the patch's libraries go **ahead** of the base's;
  - a base library the patch supersedes is **dropped**, not left behind it —
    see `ClasspathEntry::module`;
  - `arguments` appends, `minecraftArguments` replaces the game line outright,
    and the two are independent. 50 of the published Forge documents carry
    both fields at once, so a reader that picks one silently drops half the
    document.

  `opys-fabric` folds by hand — its profile has its own library spelling — but
  through the same `inherited_classpath` / `superseded` pair, never by a rule
  of its own.

- **The client jar goes last on the classpath.** After every library, which is
  where HMCL (`DefaultLauncher`: libraries into a `LinkedHashSet`, then the
  jar) and `minecraft-launcher-lib` (`get_libraries`: the loop, then the jar)
  both put it. It matters wherever a library carries a patched copy of a class
  the client jar also has: the library only wins by being ahead. opys had it
  first until this was checked.
- **Forge has no eras.** Forge installs four ways — processors, a LaunchWrapper
  tweaker, a client-jar overlay, or a bare universal zip — but none of that is
  in `opys-forge`. Every build that has ever shipped is published as an
  ordinary `inheritsFrom` document at
  `harmoniya-net.github.io/ForgeWrapper`, generated from the installers once,
  and the differences are already spelled out inside it. So the crate is an
  index lookup plus the shared fold, and is deliberately the same shape as
  `opys-fabric`. `crates/opys-forge/tests/documents.rs` parses the whole
  published set — the check to re-run whenever either side moves.
- **One binding per crate.** `opys-<x>-napi` → `@opys/<x>-binding`, named after
  the module it exposes and nothing else; a JS package imports its own binding,
  never a sibling's. Every addon statically links the same ~4 MB of
  ureq/rustls/serde across seven triples, and that cost is accepted on purpose:
  the crate split is the architecture and the binding count must not be allowed
  to shape it. Collapsing addons into one `.node` stays a live option, but it
  is one decision taken for all of them at once — not a family at a time, which
  only yields a half-merged layout that is neither.
- **One merge, one implementation.** Folding plugin contributions into a
  `Manifest` is `opys-dev`'s `assemble`; `@opys/dev` calls it through
  `@opys/dev-binding`. Driving the plugins stays in JS because plugins and the
  author's `command`/`args` accessors are closures — but a native builder
  running Rust plugins reaches the identical merge.
- **Build-time HTTP is one blocking GET.** `opys-dev`'s `http::get` — no
  retry, no streaming, no resume. Resolvers run once against small JSON APIs;
  the install path has its own downloader in `opys-runtime`, and the two must
  never be confused for one another. `opys-dev-napi` builds with the `net`
  feature off, since merging contributions needs no network.
  `http::get_json` is the layer every resolver actually calls — GET, reject a
  non-2xx as `JsonGetError::Status`, decode. It lives in `opys-dev` rather
  than in each loader crate because the status check and the decode must have
  one spelling across the family; `http::get` stays underneath it for the
  callers that treat a status as data (a 404 for a platform a release doesn't
  ship).
- **A resolver is a pure core with one impure call.** Version normalisation,
  query spelling, asset matching and template assembly are plain functions
  with plain unit tests; the request is the only part that touches the world.
  `opys-java` is the reference shape — every vendor takes an `apiBase`, so the
  network path is testable against a loopback server rather than mocked away.
- **The `@opys/mojang-rules` npm package carries types only** — no zod, no
  native code, no dependencies. Both sides of the build/runtime wall can name
  the rule contract without pulling anything in. A hand-written TS
  implementation living beside the Rust one is what silently drifted before;
  there must not be a second one.

## Plugin model — bundler-style

```ts
interface OpysPlugin {
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
  // opys.json); it belongs here.
  runClient: (manifest) => ({
    vars: { ...manifest.vars, root: userDataDir('my-pack') },
  }),
}));
```

- Flat `plugins: []` — no roles, no cardinality enforcement.
- The engine merges artifacts (concat + last-wins dedup by normalized path) and
  vars (plugin-list order, last-wins, **warns** on plugin-vs-plugin collision).
  `manifest.vars` is the silent override layer — but it is baked into
  `opys.json`, so it takes build-time constants only, never machine-specific
  paths (those go in `runClient`).
- `command` / `args` / `workdir` / `envs` are author functions over a
  `PluginMap` keyed by plugin `name`. The author owns arg order — there is no
  role-based default.
- **One var, one owner.** e.g. only the `java` plugin emits
  `java_home` / `java_bin` / `java_runtime_dir`.
- `mode` is a build-time-only `ctx` value (`opys build --mode X`).

## Build & launch

- **`opys build`** — `resolveConfig` → run every plugin's `build(ctx)` in
  parallel → concat + dedup artifacts → merge vars → assemble `launch` via the
  author functions → `encodeManifest` → write.
- **`opys launch`** — builds the manifest in-memory from the config and
  launches it directly; no `opys.json` round-trip. `runClient(manifest) =>
Partial<Manifest>` is the launch-time patch, applied every launch (so e.g.
  `bifrost` mints a fresh token) as a shallow per-field override. The
  build/runtime wall holds — `cli` orchestrates `dev` + `runtime`, joined by
  the in-memory `Manifest`; a _deployed_ launcher instead feeds
  `@opys/runtime` a frozen, published `opys.json` with no `dev`.
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
- **`cargo test --workspace`** runs the Rust suites. Behaviour ported into a
  crate is tested there, not twice: `@opys/java`'s JS tests cover only what
  the wrapper adds (the plugin closure, the typed surface), while the
  resolvers are exercised in `crates/opys-java/tests`.
- **`node scripts/smoke-napi.mjs`** loads every `.node` and crosses each
  binding once — the check that the addons are actually built and loadable.
