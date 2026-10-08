# Public API & Lifecycle

opys builds and runs Minecraft installations from a declarative manifest,
published as a bundle. The build side is a **plugin engine**; the runtime side
is a dumb manifest executor. The two are joined only by the manifest format.

## Lifecycle

### `opys build [-i config] [-o out] [--mode m]`

1. `import(config)` — load `opys.config.mjs`.
2. `resolveConfig(default, { mode })` — invoke the function form, if any.
3. `buildManifest(config, ctx)` (`@opys/dev`) → `{ manifest, blobs }`:
   - run every plugin's `build(ctx)` hook **in parallel** → `Contribution[]`
   - evaluate the `command`/`args`/`workdir`/`envs` accessor functions
   - hand both to `assemble` in the `opys-dev` crate, which:
     - concats artifacts (plugin order, then `manifest.artifacts`) and dedups
       last-wins by `posix.normalize(path)`, each path keeping the position of
       its first appearance
     - merges vars (plugin order, last wins; returns a warning on a
       plugin-vs-plugin collision), then layers `manifest.vars`
     - flattens the launch fragments into the final `Launch`
     - gathers the blobs the surviving artifacts name

   The returned manifest is in its canonical wire spelling — a rule-free single
   value is a bare string, an arm with no rules has no `rules` key.

4. `writeBundle` (`@opys/core`) → the bundle, at `-o` or `config.output`.
   With neither, the manifest alone is printed as JSON — a view of it, without
   the blobs.

### `opys launch [-i config] [--mode m]`

1. Load the config, `resolveConfig`.
2. `buildManifest` — in memory, from the config. No bundle is written: the
   blobs stay where they are on this machine and the runtime reads them there.
3. Apply the `runClient` patch: `{ ...manifest, ...runClient(manifest) }`.
4. `install(source)` then `launch(source, { install: false })`
   (`@opys/runtime`), where `source` is `{ manifest, blobs }`.

### `opys launch <bundle> [--var k=v]...`

The other way in: install and launch a built bundle, exactly as a deployed
launcher would. No config is loaded, so there is no `runClient` — machine
paths and credentials come from `--var`. `source` is `{ bundle }`.
`opys install <bundle>` is the same, stopping before the game.

### `opys install [-i config] [--mode m]`

Steps 1-4, minus the game. After `install(source)`, if the manifest's own
arguments name horno, it runs once with `-Dhorno.installOnly=true` at the front
of the JVM line — that is the half `install()` cannot do, because the loader's
processors build a patched client jar on the machine that runs them, and
pre-1.13 the client jar is rewritten outright. A build that names no horno
properties (1.6.1-1.12.2) has no such half, and the artifact install is the
whole installation.

The flag is a CLI argument, never a manifest field: a manifest describes an
installation, not a particular run of one. The launch is built as the manifest
says and the flag is added to what comes back, so a bundle is never rewritten.

## Config — `@opys/dev`

```ts
import { defineConfig } from '@opys/dev';

export default defineConfig(({ mode }) => ({
  output: 'game.opys',
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
- **`forge(version, opts?)`** — Forge, every version (1.1 onwards). `version`
  is a Minecraft version (its `best` build), an alias (`1.20.1-recommended`),
  or a full build id; `opts.source` points at another document index.
- **`neoforge(version, opts?)`** — NeoForge, resolved the same way from its own
  published index. `version` takes a Minecraft version, an alias, or a bare
  NeoForge build id (`21.1.172`).
- **`fabric(version, opts?)`** — Fabric. `version` is the Minecraft version;
  `opts.loader` pins a loader build, otherwise the newest stable one targeting
  it is resolved from Fabric Meta (`opts.source` points elsewhere).
- **`cleanroom(version, opts?)`** — a 1.12.2 Forge variant.
- **`lwjgl3ify(version, opts?)`** — a 1.7.10 Forge variant on LWJGL3.
- **`curseforge({ token, path, files })`** — mod files from the CurseForge API.
- **`authliberty(version, opts?)`** — an authlib-injector `-javaagent`.

JVM runtime — `@opys/java`:

- **`java(version, opts?)`** — provisions an OpenJDK runtime; solely owns the
  `java_home` / `java_bin` / `java_runtime_dir` vars, exposes `bin` as a
  launch group.

Generic, domain-agnostic — `@opys/dev`:

- **`files({ from, to?, url?, hash? })`** — every file under a local directory,
  as artifacts. With no `url` the files are carried in the bundle as blobs;
  with one they are published elsewhere and pointed at. The counterpart of
  `links`, which takes what is already published.

Helpers (not plugins): **`bifrost({ privateKey, username, uuid })`**
(`@opys/minecraft`) — mints an Ed25519 JWT; call it inside `runClient`.
**`userDataDir(name)`** (`@opys/dev`) — an OS-appropriate data directory.

## Manifest data model — `@opys/core`

`core` is the reference implementation of the manifest format. Every
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
- Source/Extract factories: `sourceUrl`/`sourceBlob`, `extractPick`/`extractScan`/`extractDump`
- Blobs: `blobId`, `hashBlobFile`, `blobFile`/`blobBytes`, and the `Blobs` table
- Bundle: `writeBundle`, `readBundle`, `readBundleHead`, `BUNDLE_FORMAT`
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

### Nothing is resolved at install time

A manifest names every file by a concrete source, and pins the hash of each
one it can. The installer downloads and verifies; it never asks a server what
to download or what the hash should be. An upstream that moves — a `latest`
build, a mod update — is followed by rebuilding the manifest, which a deployed
launcher picks up the next time it fetches the bundle.

The format once had two escape hatches from this, a `pointer` source and a
`discovery` block, which resolved a source or a hash on the installing
machine. Both are gone: a hash supplied by the same server as the file, at the
moment of download, verifies a transfer but pins nothing.

## Runtime — `@opys/runtime`

```ts
install(source: ManifestSource, options?: InstallOptions): Promise<void>
launch(source: ManifestSource, options?: LaunchOptions): Promise<ChildProcess>
currentPlatform(): OsOptions

type ManifestSource = Manifest | string | URL;
```

Install pipeline: `resolveManifest` → `scan` → `fetchAll` (parallel; streams to `<path>.partial`, renames atomically)
→ `verifyAll` (sha1/sha256/md5; mismatch throws `IntegrityError`) → `extractAll`
→ `sweep` (applies `restrict`).

Errors: a `RuntimeError` with a `code` (`network`, `integrity`, `extraction`,
`manifest`, `io`, `cancelled`, `other`); `NetworkError`, `IntegrityError` and
`ExtractionError` are the three with fields of their own. `runtime` depends
on `@opys/core` alone.

## CLI — `@opys/cli`

```
opys build   [-i <config>] [-o <out>] [--mode m]
opys install [-i <config>] [--mode m]
opys launch  [-i <config>] [--mode m]
```

Globals: `--log-level silent|error|warn|info|debug`, `-v`, `-h`.
Exit codes: `0` ok, `1` usage/config, `2` network, `3` integrity, `4` extraction.
