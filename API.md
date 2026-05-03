# Public API & Lifecycle

## Lifecycle

Two phases, both driven by `torba.config.mjs` (default export).

### 1. Build — `torba build [-i config] [-o out] [--mode <m>]`

1. `importConfig(absConfig)` — dynamic import of the config module
2. `resolveConfig(mod.default, { mode })` — invokes the function form (if any). `mode` defaults to `"build"` if `--mode` is not passed.
3. Drains every `ArtifactIterable` in `config.artifacts` into a flat `Artifact[]`
4. `deduplicateArtifacts` — by `posix.normalize(path)`, last entry wins
5. Builds `Manifest = { vars, launch, artifacts }`
6. `encodeManifest` → JSON → write to `--output`, `config.output`, or stdout

### 2. Launch — `torba launch [-i config] [--var K=V ...] [--mode <m>]`

1. Loads config with `mode` from `--mode` (defaults to `"launch"`)
2. If `config.artifacts?.length`, builds the manifest in memory; otherwise reads `config.output` from disk
3. Merges `config.runClient.vars` with CLI `--var` overrides
4. `install(manifestSource, opts)` — see install pipeline below
5. `launch(manifestSource, { vars, install: false, log })` — spawns the JVM
6. Awaits child `exit`/`error`

### Mode is user-driven

`--mode` lets the config function decide what to emit. The CLI defaults `mode` to the command name (`"build"` / `"launch"`) for backward compatibility, but you can override:

```sh
torba build --mode launch    # bake a local-file manifest
torba launch --mode build    # exercise the URL flow locally
```

The config function reads `mode` and chooses sources accordingly. Nothing in the framework binds `mode` values to specific behavior — it's whatever the config makes of it.

### Install pipeline (`@torba/installer`)

`resolveManifest` → `scan` (filter by platform/rules, decide what's missing) → `fetchAll` (parallel, default `concurrency: 8`; streams to `<finalPath>.partial` then renames atomically) → `verifyAll` (sha1/sha256, single attempt; on mismatch throws `IntegrityError`) → `extractAll` (only for newly fetched, archive-typed artifacts).

Progress events emitted via `onProgress`:

- `{ phase: 'resolve' }`
- `{ phase: 'download', fetched, total, skipped }` (aggregate)
- `{ phase: 'download:done', path }` (per file)
- `{ phase: 'verify' }`
- `{ phase: 'extract', count }`

### Launch pipeline (`@torba/installer`)

`resolveManifest` → re-runs `install` (unless `install: false`) → resolves vars (`resolveValDefs` then `resolveVars` for `${...}` interpolation) → interpolates `command`, `workdir`, `args`, `envs` → `child_process.spawn` with `stdio: 'inherit'`.

## CLI — `@torba/cli`

```
torba build  [-i <config>] [-o <out>] [--mode <m>]
torba launch [-i <config>] [--var K=V ...] [--mode <m>]
```

Globals: `--log-level silent|error|warn|info|debug`, `-v` (= debug), `-h`/`--help`.

Exit codes: `0` ok, `1` usage/config, `2` network, `3` integrity, `4` extraction.

Argument parsing is built on `node:util.parseArgs`.

## Config Public API

The user-facing entry point is the default export of `torba.config.mjs`, wrapped in `defineConfig(...)`.

### `defineConfig(input)` — `@torba/core` (re-exported by `@torba/minecraft`)

Identity helper for type inference. Accepts a config object or a function `(ctx) => config | Promise<config>`.

```ts
export default defineConfig(async ({ mode }) => {
  // ...
  return { output, artifacts, vars, command, runClient };
});
```

### `TorbaConfigContext`

```ts
interface TorbaConfigContext {
  /** User-provided value via `--mode`. Defaults to the CLI command name. */
  mode: string;
}
```

Authors branch on `mode` to pick `source: 'url'` vs `source: 'file'` for `artifactScanner`, or any other build-vs-runtime decision.

### `TorbaConfig`

```ts
interface TorbaConfig {
  output?: string; // default manifest output path (relative to config dir)
  artifacts?: ArtifactIterable[]; // each entry drained in order; last-wins dedup by path
  vars?: ValDefs; // record of vars; supports OS rule arms
  command?: Launch; // launch command/workdir/args/envs
  runClient?: { vars?: Record<string, string> }; // defaults for `torba launch --var`
}

type ArtifactIterable = Iterable<Artifact> | AsyncIterable<Artifact>;

type TorbaConfigInput =
  | TorbaConfig
  | ((ctx: TorbaConfigContext) => TorbaConfig | Promise<TorbaConfig>);
```

### Vars (`ValDefs`)

```ts
type ValDefs = Record<string, string | ConditionalVal[]>;
interface ConditionalVal {
  value: string;
  rules: Ruleset;
}
```

A var is either a flat string or an ordered list of rule-conditional arms. Resolution:

- string → use as-is
- arms → walk in order; last matching arm wins; no match → key omitted

Composition is plain JS — `{ ...mc.vars, classpath: forgeClasspath }` to override, no helpers needed. `${name}` interpolation runs after rule resolution; `resolveVars` does cycle detection and throws on circular references.

### Building blocks for authoring artifacts

Factory functions exported from `@torba/core`:

- **Source**: `sourceUrl(url)`, `sourceFile(path)`, `sourceString(s)`
- **Integrity**: bare `{ sha1 }` / `{ sha256 }`, or an array of those. Omit the field to skip verification.
- **Extract**: `extractPick(file, into)`, `extractScan(matches, into, opts?)`, `extractDump(into, opts?)`

An `Artifact` is:

```ts
interface Artifact {
  path: string; // destination path (interpolated against vars at install)
  source: Source; // url | file | string
  size?: number; // optional bytes
  rules: Ruleset; // OS/feature gates
  integrity?: HashEntry | HashEntry[]; // missing = skip
  metadata?: unknown;
  extract?: ExtractRule[]; // pick | scan | dump
}

type HashEntry = { sha1: string } | { sha256: string };
```

### Author-supplied artifact streams

`@torba/minecraft` and `@torba/forge` expose template builders that return `{ artifacts, vars, command }`:

- **`minecraft({ version? })`** / **`minecraftTemplate(versionId?)`** — vanilla Mojang client + libraries + assets
- **`fetchClient(versionId?)`** — `{ version, client }` for lower-level use
- **`clientToTemplate(client)`** — convert a parsed Mojang `Client`
- **`forge({ version, manifest })`** — vanilla MC + Forge mod loader, with classpath/module-path separation
- **`artifactScanner({ directory, url, path?, hash?, source?, overrides? })`** — async generator over a directory tree
  - `url` — fetch URL template (supports `${path}`, `${dir}`, `${filename}` placeholders)
  - `path` — destination path template, parallel to `url`. Defaults to `${path}` (file's relative path)
  - `source: 'url'` (default) — emits `sourceUrl` and computes hashes
  - `source: 'file'` — emits `sourceFile` pointing at the local copy and **skips hashing entirely** (trust by path)

Standard config pattern:

```js
export default defineConfig(async ({ mode }) => {
  const fr = await forge({
    version: '1.20.1',
    manifest: '/path/to/forge.json',
  });
  return {
    output: 'torba.json',
    artifacts: [
      fr.artifacts,
      artifactScanner({
        directory: './mods',
        url: 'https://cdn/...',
        source: mode === 'launch' ? 'file' : 'url',
      }),
    ],
    vars: fr.vars,
    command: fr.command,
    runClient: { vars: { root, username: 'Player', uuid: '', token: '' } },
  };
});
```

## Programmatic API — `@torba/installer`

```ts
install(source: ManifestSource, options?: InstallOptions): Promise<void>
launch(source: ManifestSource, options?: LaunchOptions): Promise<ChildProcess>
currentPlatform(): OsOptions

type ManifestSource = Manifest | string | URL;
// Manifest object → use directly
// string         → file path (read from disk)
// URL instance   → HTTP fetch

interface InstallOptions {
  platform?: OsOptions;
  vars?: Record<string, string>;
  concurrency?: number;        // default 8
  onProgress?: (p: InstallProgress) => void;
  verifyIntegrity?: boolean;   // default true
}

interface LaunchOptions {
  platform?: OsOptions;
  vars?: Record<string, string>;
  install?: InstallOptions | false;
  log?: (level: 'debug' | 'warn', msg: string) => void;
}
```

Errors: `NetworkError`, `IntegrityError` (carries `paths`), `ExtractionError` (carries `cause`), union `InstallError`.

Integrity failure is fatal on first occurrence — no retry/redownload loop. If a hash mismatches, the source is treated as bad and the install aborts.

## Manifest data model — `@torba/core`

- `Manifest`, `ManifestSchema`, `parseManifest` (JSON only), `encodeManifest`
- `filterManifest(u, os, feats?)`
- `Artifact`, `ArtifactSchema`, `encodeArtifact`, `deduplicateArtifacts`, `artifactApplies`
- Subtypes: `Source`, `Integrity`/`HashEntry`, `ExtractRule` (`Pick`/`Scan`/`Dump`), `Launch`, `ValDefs`/`ConditionalVal`
- Vars: `parseValDefs`, `encodeValDefs`, `resolveValDefs`, `integrityHashes`
- Interpolation: `resolveVars(map)` (two-pass; throws on cycles), `interpolate(template, vars)`
- Launch: `parseLaunch`, `encodeLaunch`, `LaunchSchema`, `resolvedArgs`, `resolvedEnvs`

## Other packages

- **`@torba/mojang`** — pure Mojang JSON parsers (`parseClient`, `fetchVersionManifest`, `findVersion`, `latestRelease`, `mergeArgs`, …). Zod-validated.
- **`@torba/rules`** — pure rule evaluation: `OsOptions`, `Ruleset`, `satisfiesRuleset`, `parseShortRuleset`, `allowOsRuleset`, `Valset` helpers.

## Dependency graph

```
cli       → installer, minecraft, core
installer → core, rules
minecraft → mojang, core, rules
forge     → minecraft, mojang, core
core      → rules
mojang, rules → zod
```
