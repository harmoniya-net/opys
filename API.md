# Public API & Lifecycle

opys builds and runs Minecraft installations from a declarative `opys.json`
manifest. The build side is a **plugin engine**; the runtime side is a dumb
manifest executor. The two are joined only by the frozen `opys.json` format.

## Lifecycle

### `opys build [-i config] [-o out] [--mode m]`

1. `import(config)` — load `opys.config.mjs`.
2. `resolveConfig(default, { mode })` — invoke the function form, if any.
3. `buildManifest(config, ctx)` (`@opys/dev`):
   - run every plugin's `build(ctx)` hook **in parallel** → `Contribution[]`
   - evaluate the `command`/`args`/`workdir`/`envs` accessor functions
   - hand both to `assemble` in the `opys-dev` crate, which:
     - concats artifacts (plugin order, then `manifest.artifacts`) and dedups
       last-wins by `posix.normalize(path)`, each path keeping the position of
       its first appearance
     - merges vars (plugin order, last wins; returns a warning on a
       plugin-vs-plugin collision), then layers `manifest.vars`
     - flattens the launch fragments into the final `Launch`

   The returned manifest is in its canonical wire spelling — a rule-free single
   value is a bare string, an arm with no rules has no `rules` key.

4. `encodeManifest` → JSON → write to `-o`, `config.output`, or stdout.

### `opys launch [-i config] [--mode m]`

1. Load the config, `resolveConfig`.
2. Read `opys.json` **from disk** (`config.output`) — launch never rebuilds.
3. Apply the `runClient` patch: `{ ...manifest, ...runClient(manifest) }`.
4. `install(manifest)` then `launch(manifest, { install: false })` (`@opys/runtime`).

## Config — `@opys/dev`

```ts
import { defineConfig } from '@opys/dev';

export default defineConfig(({ mode }) => ({
  output: 'opys.json',
  plugins: [ /* OpysPlugin[] */ ],
  manifest: {
    command: (plugins) => string,
    args:    (plugins) => (Valset | Val | string)[],
    workdir?: string | ((plugins) => string),
    envs?:    ValDefs | ((plugins) => ValDefs),
    vars?:    ValDefs,        // override layer on top of merged plugin vars
    artifacts?: Artifact[],  // literal artifacts, merged with plugin output
    restrict?: string[],
  },
  runClient?: (manifest) => Partial<Manifest>,
}));
```

- **`plugins`** — a flat list; no roles. The framework merges every plugin's
  `{ artifacts, vars, launch }` contribution.
- **`command`/`args`** — author functions over a `PluginMap` keyed by plugin
  `name`. `args` is flattened (`Valset[] → Val[]`); the author owns order.
- **`runClient`** — a launch-time manifest patch, re-run every `opys launch`.
  Returned fields completely replace; spread `manifest.x` to retain. The home
  for per-machine, never-shared values (auth tokens, local paths).
- **`mode`** — `opys build --mode <m>` → the config function's `ctx.mode`.

## Plugin model — `@opys/dev`

```ts
interface OpysPlugin {
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

A plugin is pure to construct — `forge('1.20.1-best')` does zero I/O; all
network/fs work happens inside `build`, which the engine drives.
`definePlugin` is an identity helper for authoring one. `@opys/dev` also
exports the build engine (`buildManifest`), the artifact-override mechanism
(`ArtifactOverride` / `applyOverrides` — a `{ match, exclude?, rules?,
integrity? }` patch — and the `Selector` type), and the `userDataDir` helper.

## Plugins

Minecraft-domain plugins — `@opys/minecraft`:

- **`minecraft(version?, opts?)`** — vanilla client + libraries + assets.
  `opts.manifestBase` points the version-manifest fetch somewhere other than
  Mojang; every loader below takes it too, since each starts from a vanilla
  version JSON.
- **`forge(version, opts?)`** — Forge (1.7–1.12 legacy + 1.13+ processor eras).
- **`cleanroom(version, opts?)`** — a 1.12.2 Forge variant.
- **`lwjgl3ify(version, opts?)`** — a 1.7.10 Forge variant on LWJGL3.
- **`curseforge({ token, path, files })`** — mod files from the CurseForge API.
- **`authliberty(version, opts?)`** — an authlib-injector `-javaagent`.

JVM runtime — `@opys/java`:

- **`java(version, opts?)`** — provisions an OpenJDK runtime; solely owns the
  `java_home` / `java_bin` / `java_runtime_dir` vars, exposes `bin` as a
  launch group.

Generic, domain-agnostic — `@opys/dev`:

- **`artifactScanner({ directory, path, url, source, overrides? })`** — scans a
  local directory tree into artifacts.

Helpers (not plugins): **`bifrost({ privateKey, username, uuid })`**
(`@opys/minecraft`) — mints an Ed25519 JWT; call it inside `runClient`.
**`userDataDir(name)`** (`@opys/dev`) — an OS-appropriate data directory.

## Manifest data model — `@opys/core`

`core` is the reference implementation of the `opys.json` format. Every
data-model type follows **parse, don't validate**: the type de/serializes
itself, normalizing as it decodes (`string | string[] → string[]`, rule
shorthand → expanded `MojangRuleset`, …). The wire structs that make that
possible are internal to the crate; no consumer names one.

- `Manifest`, `decodeManifest`, `parseManifest`, `encodeManifest`
- `filterManifest(m, os, feats?)`
- `Artifact`, `deduplicateArtifacts`
- Subtypes: `Source`, `Integrity`/`HashEntry`, `ExtractRule` (`Pick`/`Scan`/`Dump`), `Launch`, `ValDefs`/`ConditionalVal`, `Val`/`ValObject`/`Valset`
- A `Val` is `string | { rules?, value: string | string[] }` — all of which the
  manifest format allows, and a rule-free single value encodes back to the bare
  string. Read one with `valValues(val): string[]` rather than `.value`.
- Pointer: `PointerDescriptor`
- Discovery: `Discovery`, `HashRef`, `IntegrityProbes`, `SizeProbes`
- Source/Extract factories: `sourceUrl`/`sourceFile`/`sourceString`/`sourcePointer`/`sourceBytes`, `extractPick`/`extractScan`/`extractDump`
- Glob: `globToRegex`, `globToRegexSource`, `globBase`
- Vars / interpolation: `valValues`, `resolveVars`, `interpolate`, `resolvedArgs`, `resolvedEnvs`
- Rules come in two named spellings, and the distinction is the point:
  `MojangRule` / `MojangRuleset` (re-exported from `@opys/mojang-rules`) are
  the expanded, canonical form the evaluator takes; `Rule` / `Ruleset`
  (`core`'s own) are how a rule is written _in a manifest_ — either the
  shorthand string `'allow.os.linux'` or the expanded object. Neither
  spelling is transitional, and `parseShortRuleset` maps the second onto the
  first. `emptyRuleset` / `allowOsRuleset` are re-exported too. The evaluator
  is not: `core`'s `satisfiesRuleset` expands shorthand first, so it is
  strictly wider than the Mojang-standard predicate. For the strict one, use
  `@opys/mojang`.

### Pointer sources

A `pointer` source stores the URL of a JSON **descriptor** that is fetched
fresh on every install — letting a manifest track an evolving upstream. The
descriptor names the concrete `source` + `integrity` + `size`; the artifact is
still verified against the hash in that freshly-fetched descriptor.

### Discovery

A `discovery` block on a `url` artifact tells opys how to read `integrity` /
`size` from metadata the host already publishes (a sibling checksum file, an
RFC 9530 digest header). Resolved on every install; the discovered hash both
verifies the download and decides freshness.

## Runtime — `@opys/runtime`

```ts
install(source: ManifestSource, options?: InstallOptions): Promise<void>
launch(source: ManifestSource, options?: LaunchOptions): Promise<ChildProcess>
currentPlatform(): OsOptions

type ManifestSource = Manifest | string | URL;
```

Install pipeline: `resolveManifest` → `resolvePointers` → `resolveDiscovery` →
`scan` → `fetchAll` (parallel; streams to `<path>.partial`, renames atomically)
→ `verifyAll` (sha1/sha256/md5; mismatch throws `IntegrityError`) → `extractAll`
→ `sweep` (applies `restrict`).

Errors: `NetworkError`, `IntegrityError`, `ExtractionError`. `runtime` depends
on `@opys/core` alone.

## CLI — `@opys/cli`

```
opys build  [-i <config>] [-o <out>] [--mode m]
opys launch [-i <config>] [--mode m]
```

Globals: `--log-level silent|error|warn|info|debug`, `-v`, `-h`.
Exit codes: `0` ok, `1` usage/config, `2` network, `3` integrity, `4` extraction.
