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

`resolveManifest` → `resolvePointers` (resolve `pointer` sources against their live descriptors; see [Pointer sources](#pointer-sources)) → `resolveDiscovery` (resolve each `discovery` block against the live upstream; see [Discovery](#discovery)) → `scan` (filter by platform/rules, decide what's missing) → `fetchAll` (parallel, default `concurrency: 8`; streams to `<finalPath>.partial` then renames atomically) → `verifyAll` (sha1/sha256/md5, single attempt; on mismatch throws `IntegrityError`) → `extractAll` (only for newly fetched, archive-typed artifacts).

Progress events emitted via `onProgress`:

- `{ phase: 'resolve' }`
- `{ phase: 'pointer', resolved }` (only when the manifest has `pointer` sources)
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
  return {
    output,
    manifest: { artifacts, vars, launch },
    runClient,
  };
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
  manifest?: TorbaManifestConfig;
  runClient?: {
    workdir?: string; // cwd for the launched process; overrides `manifest.launch.workdir`
    vars?: Record<string, string>; // defaults for `torba launch --var`
  };
}

interface TorbaManifestConfig {
  artifacts?: ArtifactIterable[]; // each entry drained in order; last-wins dedup by path
  vars?: ValDefs; // record of vars; supports OS rule arms
  launch?: Launch; // launch command/workdir/args/envs
  restrict?: string[]; // globs whose matching files must be in artifacts[]; orphans swept after install
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

- **Source**: `sourceUrl(url)`, `sourceFile(path)`, `sourceString(s)`, `sourcePointer(descriptorUrl)` (see [Pointer sources](#pointer-sources))
- **Integrity**: bare `{ sha1 }` / `{ sha256 }` / `{ md5 }`, or an array of those. Omit the field to skip verification.
- **Extract**: `extractPick(file, into)`, `extractScan(matches, into, opts?)`, `extractDump(into, opts?)`

An `Artifact` is:

```ts
interface Artifact {
  path: string; // destination path (interpolated against vars at install)
  source: Source; // url | file | string | bytes | pointer
  size?: number; // optional bytes
  rules: Ruleset; // OS/feature gates
  integrity?: HashEntry | HashEntry[]; // missing = skip
  discovery?: Discovery; // discover integrity/size at install (see Discovery)
  metadata?: unknown;
  extract?: ExtractRule[]; // pick | scan | dump
}

type HashEntry = { sha1: string } | { sha256: string } | { md5: string };
```

### Pointer sources

Every other `Source` is static — once `torba build` writes the manifest, the
artifact is pinned. A **pointer** source is indirection: `sourcePointer(url)`
stores only the URL of a JSON **descriptor**, and the descriptor is fetched
fresh on every install. Use it for content that evolves independently of the
manifest — a translation pack repo that ships fixes, a mod that publishes a
rolling "latest" build.

```ts
// in torba.config.mjs
artifacts: [
  [
    {
      path: '${game_directory}/resourcepacks/lang.zip',
      source: sourcePointer('https://example.com/lang-pack/latest.json'),
      rules: [],
    },
  ],
];
```

The descriptor the maintainer publishes (and overwrites on each release):

```json
{
  "source": { "url": "https://cdn.example.com/lang-pack-2.4.1.zip" },
  "integrity": { "sha256": "…" },
  "size": 1843200
}
```

```ts
interface PointerDescriptor {
  source: Source; // the concrete source — may itself be another pointer (≤ 5 hops)
  integrity?: Integrity; // verifies the artifact named above
  size?: number;
}
```

At install time `resolvePointers` fetches each descriptor, rewrites the
artifact's `source` / `integrity` / `size` from it, then `scan` decides
freshness by **hash**, not mere existence:

- local file missing, or its hash ≠ the descriptor's `integrity` → re-download
- hash still matches → skip (the tiny descriptor was the only fetch)
- descriptor carries no `integrity` → always re-download (mutable, unpinnable)

So a translation pack is always current, yet costs nothing when unchanged.

**Trust model.** The descriptor itself is unverified (TLS aside) — its host
controls the channel. But the artifact it names is still verified against the
hash _in that freshly-fetched descriptor_. Omit `integrity` only for a fully
trusted channel. Core exports `PointerDescriptorSchema`, `parsePointerDescriptor`,
and `encodePointerDescriptor` for tooling that produces descriptors.

### Discovery

A `pointer` needs the upstream to publish a torba-shaped descriptor. For a
plain 3rd-party `url` that you _don't_ control, an artifact's optional
`discovery` block instead tells torba how to read the file's `integrity` and
`size` from metadata the host **already** publishes — a sibling checksum file,
a `SHA256SUMS` list, or an RFC 9530 digest header. It is resolved on every
install; the discovered hash both verifies the download and decides freshness
(matches the local copy → skip; differs → refetch).

```ts
interface Discovery {
  integrity?: {
    header?: HashRef; // read the hash from this response header
    url?: HashRef; //    or fetch this URL and match the hash in its body
  };
  size?: { header?: string }; // read the byte count from this header
}

// A location keyed by algorithm — the key picks sha1/sha256/md5, the
// string is *where* the hash lives (a header name or a URL), not the hash.
type HashRef = { sha256: string } | { sha1: string } | { md5: string };
```

```jsonc
{
  "source": { "url": "https://host/pack.zip" },
  "discovery": {
    "integrity": {
      "header": { "sha256": "Repr-Digest" },
      "url": { "sha256": "${url}.sha256" },
    },
    "size": { "header": "Content-Length" },
  },
}
```

- **`integrity.header`** — one HEAD request; the named header is parsed for a
  hash (hex, or RFC 9530 `algo=:base64:`).
- **`integrity.url`** — fetched; a hash of the named algorithm is _matched out
  of_ the body, so `sha256sum` output or a `SHA256SUMS` list works (a list is
  narrowed to the line bearing the artifact's filename). `${url}` expands to
  the artifact's own source URL; `${var}` interpolation applies.
- **Precedence** — `header` is tried before `url` (it rides the HEAD that
  `size` needs anyway; `url` costs an extra request). Supply either or both;
  both means `url` is a fallback. If an `integrity` block resolves to nothing,
  the install aborts.
- **`size.header`** — read off the same shared HEAD; usually `Content-Length`.

A discovered hash takes precedence over any literal `integrity` on the
artifact. `discovery` is only valid on a `url` source.

**Trust model.** A same-host checksum (sibling file or digest header) gives
**transport** integrity — it catches truncation, CDN corruption, cache
poisoning — not **supply-chain** integrity, since a malicious host serves
both the file and its checksum. For that, pin a literal `integrity` at build
time or curate a `pointer`. Core exports `DiscoverySchema` / `encodeDiscovery`.

### Author-supplied artifact streams

`@torba/minecraft` and `@torba/forge` expose template builders that return `{ artifacts, vars, launch, jvmArgs, mainClass, gameArgs }`:

- **`minecraft({ version? })`** / **`minecraftTemplate(versionId?)`** — vanilla Mojang client + libraries + assets
- **`fetchClient(versionId?)`** — `{ version, client }` for lower-level use
- **`clientToTemplate(client)`** — convert a parsed Mojang `Client`
- **`forge({ version, source?, forgeWrapper? })`** — Forge support. Resolves a Forge build via fuckforge (`version` accepts `'1.20.1'`, `'1.20.1-latest|recommended|best'`, or a full build ID like `'1.20.1-47.4.20'`) and branches on the build's era. Processor era (1.13+) emits vanilla MC + Forge runtime libs + installer + ForgeWrapper, and patched/SRG/extra jars are produced on-device on first launch by ForgeWrapper. Legacy era (1.7–1.12) emits vanilla MC + Forge runtime libs (Forge universal included) and launches via `net.minecraft.launchwrapper.Launch`; no installer, no ForgeWrapper. Pre-1.7 (`jarmod`/`ancient`) eras are not yet supported and throw a clear error. No EULA-restricted bytes are redistributed in any era.
- **`artifactScanner({ directory, url, path?, hash?, source? })`** — async generator over a directory tree
  - `url` — fetch URL template (supports `${path}`, `${dir}`, `${filename}` placeholders)
  - `path` — destination path template, parallel to `url`. Defaults to `${path}` (file's relative path)
  - `source: 'url'` (default) — emits `sourceUrl` and computes hashes
  - `source: 'file'` — emits `sourceFile` pointing at the local copy and **skips hashing entirely** (trust by path)

Standard config pattern:

```js
export default defineConfig(async ({ mode }) => {
  const fr = await resolveForge({ version: '1.20.1' });
  return {
    output: 'torba.json',
    manifest: {
      artifacts: [
        fr.artifacts,
        artifactScanner({
          directory: './mods',
          url: 'https://cdn/...',
          source: mode === 'launch' ? 'file' : 'url',
        }),
      ],
      vars: fr.vars,
      launch: fr.launch,
    },
    runClient: { vars: { root, username: 'Player', uuid: '', token: '' } },
  };
});
```

### Composing artifact streams (`pipe`)

`pipe(...sources)` opens an `ArtifactPipe` over one or more artifact sources —
anything iterable or async-iterable (`Artifact[]`, generators, `artifactScanner`,
a template's `artifacts`). Sources are concatenated in argument order, so the
build's last-wins-by-`path` dedup still applies. Each op records a pure transform
and returns a _new_ pipe — the chain is immutable.

```js
artifacts: [
  pipe(fr.artifacts, artifactScanner({ directory: './mods', url: '...' }))
    .exclude('**/realms*.jar')
    .skipIntegrity('**/mods/*.jar'),
];
```

- **`.exclude(selector)`** — drop every matched artifact.
- **`.skipIntegrity(selector)`** — disable hash verification for matched
  artifacts (clears both `integrity` and `discovery`).
- **`.collect()`** — `Promise<Artifact[]>` when a materialized array is needed.

An `ArtifactPipe` is itself an `AsyncIterable<Artifact>`, so it drops straight
into `artifacts: [...]` with no `await`. Sources are drained exactly once
(cached), so single-shot generators survive repeated iteration.

A **`Selector`** is `string | string[] | ((artifact: Artifact) => boolean)`.
Strings are globs (`*`, `**`, `?`, `{a,b}`) matched against `artifact.path`;
an array is OR. The predicate form is the escape hatch for matching on source
kind, size, metadata, etc. A zero-match selector is a silent no-op.

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
  cwd?: string;                       // overrides manifest's `launch.workdir`; vars-interpolated
  install?: InstallOptions | false;
  log?: (level: 'debug' | 'warn', msg: string) => void;
}
```

Errors: `NetworkError`, `IntegrityError` (carries `paths`), `ExtractionError` (carries `cause`), union `InstallError`.

Integrity failure is fatal on first occurrence — no retry/redownload loop. If a hash mismatches, the source is treated as bad and the install aborts.

## Manifest data model — `@torba/core`

- `Manifest`, `ManifestSchema`, `parseManifest` (JSON only), `encodeManifest`
- `filterManifest(u, os, feats?)`
- `validateManifest(u)` — surfaces config typos (undefined args, malformed envs) before they reach the rules engine
- `Artifact`, `ArtifactSchema`, `encodeArtifact`, `deduplicateArtifacts`, `artifactApplies`
- Subtypes: `Source`, `Integrity`/`HashEntry`, `ExtractRule` (`Pick`/`Scan`/`Dump`), `Launch`, `ValDefs`/`ConditionalVal`
- Pointer: `PointerDescriptor`, `PointerDescriptorSchema`, `parsePointerDescriptor`, `encodePointerDescriptor` (see [Pointer sources](#pointer-sources))
- Discovery: `Discovery`, `HashRef`, `DiscoverySchema`, `encodeDiscovery` (see [Discovery](#discovery))
- Pipe: `pipe`, `ArtifactPipe`, `Selector` (see [Composing artifact streams](#composing-artifact-streams-pipe))
- Glob: `globToRegex`, `globBase` — shared glob → `RegExp` compiler (`*`, `**`, `?`, `{a,b}`)
- Vars: `parseValDefs`, `encodeValDefs`, `resolveValDefs`, `integrityHashes`
- Interpolation: `resolveVars(map)` (two-pass; throws on cycles), `interpolate(template, vars)`
- Launch: `parseLaunch`, `encodeLaunch`, `LaunchSchema`, `resolvedArgs`, `resolvedEnvs`
- Restrict: `Manifest.restrict?: string[]` — globs (with `${var}` interpolation) for directories whose files must come from `artifacts[]`. After install + extract, orphans are swept and empty subdirs pruned. Glob syntax: `*`, `**`, `?`, `{a,b}`. Auto-ignores `.torba-extracted` markers and `.cache/` archive dirs.

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
