# Public API & Lifecycle

lanka builds and runs Minecraft installations from a declarative `lanka.json`
manifest. The build side is a **plugin engine**; the runtime side is a dumb
manifest executor. The two are joined only by the frozen `lanka.json` format.

## Lifecycle

### `lanka build [-i config] [-o out] [--mode m]`

1. `import(config)` — load `lanka.config.mjs`.
2. `resolveConfig(default, { mode })` — invoke the function form, if any.
3. `buildManifest(config, ctx)` (`@lanka/dev`):
   - run every plugin's `build(ctx)` hook **in parallel** → `Contribution[]`
   - concat artifacts (plugin order, then `manifest.artifacts`), dedup last-wins by `posix.normalize(path)`
   - merge vars (plugin order, last wins; warn on plugin-vs-plugin collision), then layer `manifest.vars`
   - assemble `launch` from the `command`/`args`/`workdir`/`envs` accessor functions
4. `encodeManifest` → JSON → write to `-o`, `config.output`, or stdout.

### `lanka launch [-i config] [--mode m]`

1. Load the config, `resolveConfig`.
2. Read `lanka.json` **from disk** (`config.output`) — launch never rebuilds.
3. Apply the `runClient` patch: `{ ...manifest, ...runClient(manifest) }`.
4. `install(manifest)` then `launch(manifest, { install: false })` (`@lanka/runtime`).

## Config — `@lanka/dev`

```ts
import { defineConfig } from '@lanka/dev';

export default defineConfig(({ mode }) => ({
  output: 'lanka.json',
  plugins: [ /* LankaPlugin[] */ ],
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
- **`runClient`** — a launch-time manifest patch, re-run every `lanka launch`.
  Returned fields completely replace; spread `manifest.x` to retain. The home
  for per-machine, never-shared values (auth tokens, local paths).
- **`mode`** — `lanka build --mode <m>` → the config function's `ctx.mode`.

## Plugin model — `@lanka/dev`

```ts
interface LankaPlugin {
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
`definePlugin` is an identity helper for authoring one. `@lanka/dev` also
exports the build engine (`buildManifest`), the artifact-override mechanism
(`ArtifactOverride` / `applyOverrides` — a `{ match, exclude?, rules?,
integrity? }` patch — and the `Selector` type), and the `userDataDir` helper.

## Plugins

Minecraft-domain plugins — `@lanka/minecraft`:

- **`minecraft(version?)`** — vanilla client + libraries + assets.
- **`forge(version, opts?)`** — Forge (1.7–1.12 legacy + 1.13+ processor eras).
- **`cleanroom(version, opts?)`** — a 1.12.2 Forge variant.
- **`lwjgl3ify(version, opts?)`** — a 1.7.10 Forge variant on LWJGL3.
- **`curseforge({ token, path, files })`** — mod files from the CurseForge API.
- **`authliberty(version, opts?)`** — an authlib-injector `-javaagent`.

JVM runtime — `@lanka/java`:

- **`java(version, opts?)`** — provisions an OpenJDK runtime; solely owns the
  `java_home` / `java_bin` / `java_runtime_dir` vars, exposes `bin` as a
  launch group.

Generic, domain-agnostic — `@lanka/dev`:

- **`artifactScanner({ directory, path, url, source, overrides? })`** — scans a
  local directory tree into artifacts.

Helpers (not plugins): **`bifrost({ privateKey, username, uuid })`**
(`@lanka/minecraft`) — mints an Ed25519 JWT; call it inside `runClient`.
**`userDataDir(name)`** (`@lanka/dev`) — an OS-appropriate data directory.

## Manifest data model — `@lanka/core`

`core` is the reference implementation of the `lanka.json` format. Every
data-model file follows **parse, don't validate**: a zod wire schema validates
the JSON shape, and a total `decode` function normalizes it into the domain
type (`string | string[] → string[]`, rule shorthand → full `Ruleset`, …).

- `Manifest`, `ManifestWireSchema`, `decodeManifest`, `parseManifest`, `encodeManifest`
- `filterManifest(m, os, feats?)`
- `Artifact`, `ArtifactWireSchema`, `decodeArtifact`, `encodeArtifact`, `deduplicateArtifacts`, `artifactApplies`
- Subtypes: `Source`, `Integrity`/`HashEntry`, `ExtractRule` (`Pick`/`Scan`/`Dump`), `Launch`, `ValDefs`/`ConditionalVal`
- Pointer: `PointerDescriptor`, `PointerDescriptorWireSchema`, `parsePointerDescriptor`, `encodePointerDescriptor`
- Discovery: `Discovery`, `HashRef`, `DiscoveryWireSchema`, `decodeDiscovery`, `encodeDiscovery`
- Source/Extract factories: `sourceUrl`/`sourceFile`/`sourceString`/`sourcePointer`, `extractPick`/`extractScan`/`extractDump`
- Glob: `globToRegex`, `globBase`
- Vars / interpolation: `parseValDefs`, `resolveValDefs`, `resolveVars`, `interpolate`
- The `@lanka/mojang-rules` rule surface is re-exported from `core`.

### Pointer sources

A `pointer` source stores the URL of a JSON **descriptor** that is fetched
fresh on every install — letting a manifest track an evolving upstream. The
descriptor names the concrete `source` + `integrity` + `size`; the artifact is
still verified against the hash in that freshly-fetched descriptor.

### Discovery

A `discovery` block on a `url` artifact tells lanka how to read `integrity` /
`size` from metadata the host already publishes (a sibling checksum file, an
RFC 9530 digest header). Resolved on every install; the discovered hash both
verifies the download and decides freshness.

## Runtime — `@lanka/runtime`

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
on `@lanka/core` alone.

## CLI — `@lanka/cli`

```
lanka build  [-i <config>] [-o <out>] [--mode m]
lanka launch [-i <config>] [--mode m]
```

Globals: `--log-level silent|error|warn|info|debug`, `-v`, `-h`.
Exit codes: `0` ok, `1` usage/config, `2` network, `3` integrity, `4` extraction.
