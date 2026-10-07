# opys

A declarative toolkit that **builds** and **launches** Minecraft installations
from a frozen `opys.json` manifest. A config (`opys.config.mjs`) composes
plugins into a manifest at build time; the runtime installs and launches it.

This file is the architecture of record — principles, structure, conventions.
Treat every claim here as auditable against the code.

The claims a machine can audit are audited: `scripts/architecture/rules.mjs`
restates the boundaries below as data and `npm run architecture` holds the
tree to them (see _Boundaries are checked_). Where this file and that one
disagree, one of them is wrong — fix it in the same change.

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

A clean DAG, no cycles. Each loader and provider is also published as its own
package (`@opys/forge`, `@opys/modrinth`, …); `@opys/minecraft` re-exports
them, and the list below names the layers rather than every one:

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
@opys/minecraft     Minecraft-domain plugins — minecraft / forge / neoforge /
                     fabric / cleanroom / lwjgl3ify / curseforge / authliberty — +
                     bifrost / serverlist helpers. Every plugin here is a thin
                     wrapper over the crate of the same name, each with its
                     own `.node`.                           → dev, core, mojang
@opys/java          JDK provisioning — Temurin / Zulu / GraalVM CE.
                     Thin wrapper over the `opys-java` crate.                → dev, core
@opys/link          A pasted link → a pinned artifact: GitHub / GitLab / Modrinth /
                     CurseForge / a plain URL.
                     Thin wrapper over the `opys-link` crate.                → dev, core
@opys/dgpuj         The dgpuj GPU-selection shim, one archive per target.
                     Thin wrapper over the `opys-dgpuj` crate.               → dev, core
@opys/cli           the `opys` binary.                 → core, dev, runtime, minecraft
```

### Invariants

- **`core` is the frozen manifest spec.** Its schemas are the contract.
- **A manifest is fully resolved; the installer looks nothing up.** Every
  artifact names a concrete source and, wherever one can be had, a pinned
  hash. Finding out what to download or what its hash should be is build-time
  work, and belongs to a plugin. The format used to allow two exceptions — a
  `pointer` source, and a `discovery` block that read a hash from a header or
  a sidecar file at install time — and both were removed (the one deliberate
  break of the frozen format). A hash that arrives from the same server as the
  file verifies a transfer and pins nothing, and "follow latest" is what
  rebuilding the manifest is for: a deployed launcher fetches `opys.json`
  itself, so the manifest is the pointer.
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
- **`runtime` depends on `core` alone** among `@opys/*` — `runtime/lib`
  imports only `@opys/core`, its own binding, and `node:`, with no third-party
  dependency at all. It is a clean reimplementation target.
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
  `harmoniya-net.github.io/metadata/forge`, generated from the installers once,
  and the differences are already spelled out inside it. So the crate is an
  index lookup plus the shared fold, and is deliberately the same shape as
  `opys-fabric`. `crates/opys-forge/tests/documents.rs` parses the whole
  published set — the check to re-run whenever either side moves.
- **NeoForge is published the same way, and is its own crate anyway.**
  `harmoniya-net.github.io/metadata/neoforge` carries the same index and
  the same document shape, so `opys-neoforge` is `opys-forge` down to the file
  names. They are kept apart because what they share is our publication format
  and nothing of Forge's: NeoForge has its own maven, no promotions endpoint,
  and a versioning scheme that has already changed once. Two differences are
  real and live in the crate — `DEFAULT_NEOFORGE_INDEX`, and a build-id lookup
  that scans the whole index rather than filtering by prefix.
- **Cleanroom's document is a whole version, not a patch.**
  `harmoniya-net.github.io/metadata/cleanroom` carries the same index as the
  other two, but each document is a complete version JSON: no `inheritsFrom`,
  no horno. Cleanroom's installer has never run a processor — it unpacks one
  jar, which is also a release asset — so there is nothing to do on the
  launching machine and nothing to fold. `opys-cleanroom` therefore reads the
  document as a `Client`, through `Client::from_version_json`, and takes the
  vanilla path from there; it never fetches a vanilla version at all.

  The reason it is not a patch is the reason the old TypeScript loader carried
  a filter. Cleanroom replaces vanilla 1.12.2's LWJGL 2 (`org.lwjgl.lwjgl`)
  with LWJGL 3 (`org.lwjgl`): different groups, so the `inheritsFrom` merge
  supersedes nothing and leaves both on the classpath. That rule is applied
  once, in the generator, when it folds the pre-0.5.16 patches; from 0.5.16 on
  Cleanroom ships the complete document itself. Either way the crate filters
  nothing — what a document declares is what runs.

- **lwjgl3ify is a document and two mods, from two places.**
  `harmoniya-net.github.io/metadata/lwjgl3ify` publishes each release's own
  `version.json` — complete, like Cleanroom's — with its libraries made
  installable: paths derived, bare coordinates resolved to a hash and a size,
  and the ones its maven has since pruned addressed at the release's assets.
  `opys-lwjgl3ify` reads that as a `Client`, exactly as `opys-cleanroom` does.

  The mod jar and UniMixins are not in it. They belong in `mods/`, which a
  version JSON cannot express, so the crate reads them off GitHub Releases and
  appends them to `artifacts` — never to the classpath. The lwjgl3ify release
  is fetched **by tag** (`fetch_github_release`), since the index already named
  it and the repository has more releases than one page of the listing holds.

- **The loader's installer is not a library, and neither is the ancient era's
  overlay zip.** A document names them with `-Dhorno.installer` /
  `-Dhorno.jarmod` plus a `…Url` and a `…Sha1`, and horno fetches them itself.
  Declaring them libraries was the only reason either ever reached `-cp`, where
  `neoforge-<v>-installer.jar` becomes an automatic module named `neoforge` —
  colliding with FML's own — and its shaded Gson shadows the game's, which is
  what killed NeoForge 26.x with `NoSuchMethodError: JsonObject.get`. The
  vanilla client jar stays a library, because it is a real runtime dependency.
  So nothing in opys filters the classpath: what a document declares is what
  runs.
- **A build id says nothing about its Minecraft version.** NeoForge `21.1.172`
  does mean 1.21.1, and for years every version did — which is exactly why
  deriving it looked safe. `26.2.0.84` targets Minecraft `26.2`, which has no
  leading `1.` at all: Mojang's release line is year-based now, and NeoForge
  grew a fourth component. So the generator reads `inheritsFrom` out of the
  installer's own version JSON and the crate looks a build id up in the index.
  Nothing anywhere parses either one. The JS `nfVersionToMc` that used to did,
  and was already wrong.
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
- **Build-time HTTP is one blocking request.** `opys-dev`'s `http::get` — no
  retry, no streaming, no resume. It has two siblings, each for one caller:
  `post_json`, because CurseForge takes its batched file lookup as a document,
  and `get_bytes`, because a modpack's index is inside its archive and has to
  be read to resolve it. Neither is a downloader. Resolvers run once against small JSON APIs;
  the install path has its own downloader in `opys-runtime`, and the two must
  never be confused for one another. `opys-dev-napi` builds with the `net`
  feature off, since merging contributions needs no network.
  `http::get_json` is the layer every resolver actually calls — GET, reject a
  non-2xx as `JsonGetError::Status`, decode. It lives in `opys-dev` rather
  than in each loader crate because the status check and the decode must have
  one spelling across the family; `http::get` stays underneath it for the
  callers that treat a status as data (a 404 for a platform a release doesn't
  ship).
- **A link is resolved once, by whoever publishes its hash — or by reading the
  file.** `opys-link` takes the URL a config author already has and turns it
  into a pinned file. `parse_link` is pure: it says which provider a URL
  belongs to and what it names there. `resolve_links` asks that provider —
  GitHub and GitLab through `opys-dev`'s clients, Modrinth and CurseForge
  through their crates — and each answers with the hash it publishes. A file
  with no publisher (an old GitHub asset, a plain URL) is downloaded at build
  time and hashed, by `opys-dev`'s `pin_url`. That last case is what makes the
  rule about fully resolved manifests hold for _any_ file, not only for files
  on a cooperative host. The crate only dispatches; it holds no client of its
  own.
- **A GitHub asset is pinned one way.** `opys-dev`'s `pin_github_asset` takes
  the digest the release listing carries and, for a release old enough to have
  none, downloads the asset and hashes it. `opys-link`, `opys-dgpuj` and
  `opys-lwjgl3ify`'s mod jars all go through it, so none of them can ship an
  asset unverified — which is what lwjgl3ify's mod jar did while that choice
  was spelled per crate. `@opys/dev`'s `gitHubReleaseArtifacts` is the public
  JS helper for a config author who needs a predicate over assets; nothing
  inside opys calls it.
- **A callback never crosses napi; its answers do.** `modrinth`, `curseforge`
  and `links` take a `path` function from the config author, and `authliberty`
  may take `hosts` as one. A closure cannot be handed to Rust,
  so each is split in two on the crate side: resolve to plain data, then build
  from that data plus what the callback returned (`file_artifacts(files,
paths)`). The wrapper's only job is the call in between.
- **A modpack resolves to a `LoaderSpec` and stops.** Standing a loader up
  means running another plugin, and plugins are driven from the host, so
  `modrinthModpack` / `curseforgeModpack` compose in JS — `(options.loader ??
loaderPlugin)(pack.loader)`. What the two pack formats share lives in
  `opys-modpack`, which has no binding: the `LoaderSpec` itself, and
  `PackArchive`, which reads an entry out of the downloaded archive and
  describes that same archive to the runtime as the artifact that unpacks the
  overrides, with the hash of the bytes that were read.
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

## Boundaries are checked

Prose drifts; this file once said `runtime` imported `fflate` long after it
had stopped. So the boundaries are also written down as data, in
`scripts/architecture/rules.mjs`, and `scripts/check-architecture.mjs` fails
when the tree leaves them. Everything there is an allow-list — a crate or
package it does not name fails the check — so the way to add an edge, a
binding or an exemption is to edit that file, where a reviewer sees it as the
architectural change it is.

What it holds:

- **The DAG.** Each crate's and each package's internal dependencies, from
  `cargo metadata` and the `package.json`s, against what it is allowed.
- **The walls**, over everything a node _reaches_ rather than what it names,
  and across napi: a wrapper package reaches the crate behind its binding. The
  allow-lists are checked against the walls too, so loosening one cannot take
  a wall down unnoticed.
- **One binding per crate.** `opys-<x>-napi` depends on `opys-<x>`, reaches
  nothing that crate does not, is a `cdylib`, and stays off crates.io; a
  package depends on its own binding and no other.
- **Imports are declared.** Read from the TypeScript syntax tree: no package a
  `package.json` does not list (hoisting hides those), no subpath into another
  package, no relative path out of one. `lib/` may not use a devDependency.
- **The source-level principles that can be read syntactically**: a `class` in
  `lib/` is an `Error` or a named exemption; no `as unknown as`; a `…Wire`
  type is never `pub`; a file that names `HashMap` says why.
- **The hand-kept lists.** npm workspaces, the release workflow's
  build / upload / download / publish steps per binding, `cargo publish` for
  every publishable crate in dependency order, the version stamp, and the
  smoke test. Adding a binding means touching all of them, and each has been
  missed before.

What it cannot hold — purity, total transforms, that a resolver has exactly
one impure call — stays a matter of review. The checks themselves are pure
functions over a snapshot of the tree, and `npm run test:architecture` breaks
a small sound world one rule at a time to show each can fail.

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
- **`opys install`** — the same build and install as `launch`, stopping before
  the game. Where the manifest's own arguments name horno, it is run once with
  `-Dhorno.installOnly=true` prepended, because the loader's processors — and,
  pre-1.13, rewriting the client jar — happen on the launching machine and
  `install()` cannot do them. The flag goes on the JVM line, never into
  `opys.json`: the manifest describes an installation, not a run of one.
- **`opys launch`** — builds the manifest in-memory from the config and
  launches it directly; no `opys.json` round-trip. `runClient(manifest) =>
Partial<Manifest>` is the launch-time patch, applied every launch (so e.g.
  `bifrost` mints a fresh token) as a shallow per-field override. The
  build/runtime wall holds — `cli` orchestrates `dev` + `runtime`, joined by
  the in-memory `Manifest`; a _deployed_ launcher instead feeds
  `@opys/runtime` a frozen, published `opys.json` with no `dev`.
- The runtime install pipeline is phased: resolve → scan → fetch → verify →
  extract → sweep. Failure is a discriminated union —
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
- **`npm run architecture`** holds the tree to
  `scripts/architecture/rules.mjs`. It reads manifests and sources only, so it
  needs nothing built; it runs on every commit and first in CI.
- **`node scripts/smoke-napi.mjs`** loads every `.node` and crosses each
  binding once — the check that the addons are actually built and loadable.
