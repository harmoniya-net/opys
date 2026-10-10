# opys

A declarative toolkit that **builds** and **launches** Minecraft installations
from a manifest, published as one file — a **bundle**. A config
(`opys.config.mjs`) composes plugins into a manifest at build time; the
runtime installs and launches it.

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

**The manifest format is the contract.** `@opys/core`'s public schemas _are_
it — a non-TypeScript reimplementation would reimplement exactly `core`.
Package layout, plugin API, config shape, and CLI flags may all change freely;
the format changes only on purpose, and a bundle says which format it is
written in (`format`, in its head) so a reader refuses what it does not know.
The bundle itself — the zip, its head — is `@opys/bundle`'s: the manifest is
the contract, and the file is one way of carrying it.

**A reader reads one format and refuses every other**, an older one as much
as a newer. There is no migration, no compatibility reading and no "best
effort": a manifest that is half understood installs or deletes the wrong
files, and a bundle is cheap to rebuild from its config. So a format change
ships with no code for the format it replaces, and the answer to an old
bundle is `opys build`.

Nothing has been published yet, so the format is still 1, and it has
already been reshaped on purpose four times. `pointer` sources and the
`discovery` block were removed, because a manifest must be fully resolved.
Then the three sources that put a file _into_ the manifest or read it off the
installing machine — `file`, `string`, `bytes` — gave way to `blob`, and the
manifest went from a JSON document to a bundle. Then `restrict`, a list of
globs, became `cleanup`, a list of rules. Then the manifest, which a bundle
had kept in two entries, went back to one, and the head kept nothing but
`format`. Since then the head has gained `options`, which is an addition
and reshaped nothing. From the first published bundle on, a change like any of these
raises the number.
All four are described under _Invariants_.

## Packages

A clean DAG, no cycles. Each loader and provider is also published as its own
package (`@opys/forge`, `@opys/modrinth`, …); `@opys/minecraft` re-exports
them, and the list below names the layers rather than every one:

```
@opys/mojang-rules  Mojang-standard rule format — MojangRule / MojangRuleset.   leaf
@opys/mojang        Mojang protocol parsers (version JSON, libraries, assets, …).
                     Thin wrapper over the `opys-mojang` crate. → mojang-rules
@opys/core          Manifest data model + opys shorthand + Val/Valset.
                     The reference implementation of the format.        → mojang-rules
@opys/bundle        The bundle: the zip a manifest is published as.
                     Thin wrapper over the `opys-bundle` crate.                  → core
@opys/dev           Build SDK: defineConfig, the build engine, the plugin contract,
                     artifact overrides, files, userDataDir.
                     The contribution merge is the `opys-dev` crate.               → core
@opys/runtime       install + launch executor.                       → core, bundle ONLY
@opys/minecraft     Minecraft-domain plugins — minecraft / forge / neoforge /
                     fabric / cleanroom / lwjgl3ify / curseforge / authliberty — +
                     bifrost / serverlist helpers. Every plugin here is a thin
                     wrapper over the crate of the same name, through its
                     namespace of the addon.                → dev, core, mojang
@opys/java          JDK provisioning — Temurin / Zulu / GraalVM CE.
                     Thin wrapper over the `opys-java` crate.                → dev, core
@opys/links         A pasted link → a pinned artifact: GitHub / GitLab / Modrinth /
                     CurseForge / a plain URL.
                     Thin wrapper over the `opys-links` crate.                → dev, core
@opys/dgpuj         The dgpuj GPU-selection shim, one archive per target.
                     Thin wrapper over the `opys-dgpuj` crate.               → dev, core
@opys/cli           the `opys` binary.         → core, bundle, dev, runtime, minecraft
```

### Invariants

- **`core` is the manifest spec.** Its schemas are the contract.
- **A source is a `url` or a `blob`, and a blob is named by its content.** A
  blob artifact is `{ "source": { "blob": "<sha256>" } }`: the manifest says
  _which_ bytes and never where they are kept, so the name is also the
  integrity pin and a blob artifact carries no `integrity` of its own.
  Decoding gives it one all the same, which is why nothing in the runtime
  tells a blob from a download when it verifies. Where the bytes are is an
  entry of a bundle, and nothing else: a blob exists only in one. Before a
  bundle is written the bytes are on the build machine, and that is said by
  a build-time artifact, never by a manifest; that
  is the whole difference from the `file` and `bytes` sources it replaced,
  which made a manifest either machine-specific or megabytes of base64.
- **A manifest is published as a bundle, and a bundle is a zip.** `opys.json`
  (the head), `manifest.json` (the manifest, whole) and `blobs/<sha256>`. Not
  a format of our own: the reader is `unzip`. The head is about the bundle
  and the manifest is about the installation, and nothing of the manifest is
  in the head. It was once: a bundle kept `vars`, `launch` and `cleanup`
  there and the artifact list in an entry of its own, so that a launch line
  could be read without the megabytes of list. That bought one cheap read
  and cost the format a second spelling of the manifest — two entries that
  had to be put back together, and a `Head` type that was a `Manifest` with
  a field missing. So `manifest.json` is exactly what `core` reads and
  writes, and the head says `format` and `options`. It is still the first
  entry and stored uncompressed, readable with one seek or off the front of
  the file, because it is where whatever is worth knowing about a bundle
  without decoding its manifest goes. A bundle is written deterministically (fixed timestamps,
  blobs in id order), each blob is hashed against its name as it is written,
  and a reader refuses a bundle that names a blob it does not hold before
  installing anything from it.
- **A carried file is said on its own artifact, and only until the merge.**
  A plugin hands over a `BuildArtifact` (`opys-dev`): a manifest's artifact
  whose `source` may also be `{ file }`, a path on the build machine, or
  `{ bytes }` the plugin made. `assemble` reads each one, names it by its
  sha256 and emits an ordinary `{ blob }` artifact, with the bytes set aside
  as the bundle writer's input. So a plugin computes no id and keeps no
  table, and the manifest cannot hold either source. There used to be a
  `blobs` table beside a contribution's artifacts, id → where the bytes
  are: the old `file` and `bytes` sources moved one step sideways, and a
  second object every plugin, the engine and the runtime had to pass along.
  Everything of a build-time artifact but its source is read by the
  manifest's own reader, so it has no second spelling of `rules` or
  `extract`. The loader crates still hold an id → path map between
  resolving a config's libraries and building their contribution, since
  they hash those to pin them; `BuildArtifact::carrying` puts the two back
  together there, and nothing past that point sees it.
- **A bundle says what a player may set, and the installer never reads
  it.** A manifest tests features and names variables, and nothing in it
  says which of those are a player's. The head's `options` does: a tree in
  which every node fills a variable except a `feature`, which switches one
  on and holds the options that only matter while it is. It is in the head
  because a launcher draws the settings before it installs anything, and
  out of the manifest because it describes a form, not an installation:
  an install is still handed plain `vars` and `features`, and neither the
  runtime nor `core` knows the schema exists. An option is told apart by
  the field that holds its name, `{ "slider": "xmx" }`, as a `Source` is.
  The schema lived in the launcher's CMS before, in one object per option
  with every field of every kind nullable and every default a string, and
  the launcher carried decoders for that. So each kind takes its own fields
  and refuses the rest, a default has its kind's type, and a tree that names
  a variable twice or defaults a select to a value it does not offer does
  not decode (`Options`, in `opys-bundle`). A config writes the tree as a
  chain, `options().slider('xmx', range).title('RAM').unit('MB')`: what a
  kind cannot do without is in the call, where leaving it out is a compile
  error, and the rest is chained, each step belonging to the option just
  added. `title` is chained and needed, so it is the one thing the compiler
  cannot ask for, and `optionDefs` asks for it by name. A chain is a value
  made of closures, not a class: every step returns a new one. Resolving a schema and a
  player's choices into `vars` and `features` is not here yet: it stays
  with whoever shows the form, and `opys launch` takes `--var` and
  `--feature`.
- **An install stays in its root.** `root` is the one variable the runtime
  reads by name. Every path an install writes or removes, an artifact, an
  extract's `into`, a `cleanup` include, and the manifest's `workdir`, is
  held to it before anything is fetched (`opys-runtime`'s `root`). `${root}`
  was a convention every plugin kept and nothing checked: an artifact at
  `/etc/x` was written, `into: '${root}/..'` with `clean` emptied the
  directory above, and a `cleanup` rule could name anybody's home as long
  as it was absolute. A bundle is a file from somebody else, so the caller's
  `root` wins over the manifest's and a launcher always passes one. The
  check is on text: a path is inside when it begins with the root and has
  no `..` after it, which makes a relative path or one elsewhere outside by
  construction. The root is made absolute once and written back as the
  variable, so the string that was checked is the string that is opened.
  Links are not resolved. One a tar would plant pointing out of its `into`
  is refused where it is made, since it is a door for the next artifact;
  one the player made in their own root is theirs. `command` is not held to
  the root, `java` off the `PATH` being outside all of them, and neither is
  a `cwd` the caller gave. `build_launch` holds nothing to it either: it is
  a question, possibly about another platform, and reads nothing.
- **Dev and production install the same way: from a bundle.** A blob is
  copied out of a bundle and from nowhere else, so `opys launch` writes what
  it built to a temporary bundle and hands the runtime that, exactly what a
  deployed launcher hands it. The runtime's `{ manifest }` source remains
  for a manifest that carries nothing, and one that names a blob is refused
  before anything is installed. There is no source kind that exists only on
  a developer's machine and no install path production never exercises. The
  cost is zipping the carried files on each launch.
- **A manifest is fully resolved; the installer looks nothing up.** Every
  artifact names a concrete source and, wherever one can be had, a pinned
  hash. Finding out what to download or what its hash should be is build-time
  work, and belongs to a plugin. The format used to allow two exceptions — a
  `pointer` source, and a `discovery` block that read a hash from a header or
  a sidecar file at install time — and both were removed. A hash that arrives from the same server as the
  file verifies a transfer and pins nothing, and "follow latest" is what
  rebuilding the manifest is for: a deployed launcher fetches the bundle
  itself, so the manifest is the pointer.
- **`cleanup` removes what its rules name, and never what the manifest
  installed.** A rule is `includes` less `excludes`, globs over whole paths,
  applied as the last phase of an install. It has no switch for sparing the
  manifest's own files, because the only other setting would delete what was
  just installed; and "the manifest's own" includes whatever an artifact was
  unpacked into, which the `restrict` it replaced swept. Paths are compared
  as paths: `${game_directory}` ends in `/`, and comparing strings once made
  `${game_directory}/mods/a.jar` and `${root}/mods/a.jar` two files, one of
  them stale. A rule that could reach further than its author meant — an
  undefined variable, a relative path, a `..`, no directory ahead of its
  first wildcard — is a manifest error raised before anything is fetched. A
  directory goes with its files when it is left empty, so one rule covers
  both a stray jar and the whole game directory of an earlier pack version.
  The field is the author's alone: a plugin cannot contribute a rule, since
  a rule that deletes is not something to receive from a dependency.
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
  `objects` are `BTreeMap`s. Both were `HashMap`s and both made a manifest
  differ run to run.
- **The bundle is its own crate and package, beside `core`.** `core` is the
  manifest; `opys-bundle` reads and writes the file one is published in, and
  owns `Head`, the format number and the options. It also owns
  what a bundle is written from — `Blobs`, id → a file or bytes — and the
  hashing that names a blob. `core` keeps only the reference, `{ blob }`,
  and the check that an id is well formed.
- **`runtime` depends on `core` and the bundle alone** among `@opys/*`. The
  crate reads a bundle through `opys-bundle`; `runtime/lib` imports only
  `@opys/core`, its namespace of the addon, and `node:`, with no third-party dependency
  at all. It is a clean reimplementation target.
- **`dev` and `runtime` never see each other.** `core` is the only plank across
  the build-time / runtime wall; they are joined solely by the manifest.
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

- **An asset goes where its index's game will look, and is pinned wherever
  that is.** Three layouts, and the asset index says which: the hashed store
  (`objects/<ab>/<hash>`) for everything since 1.7.3; for the `legacy` index
  (1.6-1.7.2, `virtual`) the same files under their names in a directory the
  game is handed as `${game_assets}`; and for `pre-1.6`
  (`map_to_resources`) under their names in the game directory's
  `resources/`. A game on an old layout given a hashed store starts and runs
  silent, which is what every one of them did until a launch matrix made
  somebody look. A file goes to one place, not two — the official launcher
  keeps the store and copies out of it — and each carries the sha1 that
  names it: the belief that a content-addressed path verifies itself left
  most of an installation unchecked.
- **A config's own libraries are folded like a patch's.** A loader takes
  `libraries`, each `{ name, artifact }`, as a version JSON pairs them. The
  artifact is a manifest's own — the type a config already writes under
  `manifest.artifacts`, with its `rules`, `integrity` and `extract`, read by
  the manifest's own reader — and differs in two places: its `path` is
  relative to the library directory, as a version JSON's is, and its `source`
  may be a `file`, a jar on the author's disk, which a manifest cannot name
  and which therefore travels as a blob. A link with no `integrity` is
  downloaded once at build time to be pinned, so a manifest stays fully
  resolved whatever the author wrote. Libraries go ahead of everything on the
  classpath and take the place of the version's library of the same
  `group:artifact`, which is what `inheritsFrom` means for a patch's and is
  the same code path. That holds for a library with `rules` too: it replaces
  the version's copy on every OS, including those its rules leave out. An
  override is whole, and whoever makes one says what each OS gets by adding
  an entry for each; replacing a library for one OS while the version's own
  carried on for the rest would be two sources of truth for one module.
  It all happens in `opys-minecraft-vanilla`'s `add_libraries`, which every
  loader ends in; a template keeps its classpath as entries for this, since
  what a library supersedes can only be told from an entry's module.
- **The client jar goes last on the classpath.** After every library, which is
  where HMCL (`DefaultLauncher`: libraries into a `LinkedHashSet`, then the
  jar) and `minecraft-launcher-lib` (`get_libraries`: the loop, then the jar)
  both put it. It matters wherever a library carries a patched copy of a class
  the client jar also has: the library only wins by being ahead. opys had it
  first until this was checked. Where a loader's document lists
  `com.mojang:minecraft` as a library of its own — every build horno
  installs — that entry supersedes the vanilla jar and takes whatever place
  the document gave it, and there is no client jar left to put last.
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
- **One addon, and a namespace per crate.** `opys-napi` is the only `cdylib`
  and `@opys/binding` the only binding. Every crate with a JS surface is a
  module there and a namespace of the addon: `opys-forge` is `mod forge` and,
  from JS, `binding.forge`. The boundaries did not go with the addons, they
  moved to the namespace: a module names its own crate and what that crate
  already reaches, and an `@opys/*` package imports its own namespace and no
  other. So `mod forge` cannot call `opys-runtime` any more than `opys-forge`
  can, and the wall between build time and runtime holds inside one binary.
  There were nineteen addons, one per crate. Each that resolved anything
  linked its own copy of ureq, rustls and serde, and together they weighed
  89 MB on one target where the one addon weighs 16; a release published 133
  platform packages where it now publishes seven. The cost is that a
  launcher, which wants the runtime alone, carries the build side too: about
  2 MB more than `runtime` and `core` came to. The crate split is the
  architecture and was never the addon count.
- **One merge, one implementation.** Folding plugin contributions into a
  `Manifest` is `opys-dev`'s `assemble`; `@opys/dev` calls it through
  the addon's `dev` namespace. Driving the plugins stays in JS because plugins are
  closures — but a native builder running Rust plugins reaches the identical
  merge.
- **The launch line is data, and a reference is resolved where the merge
  is.** `args: ['@forge.jvmArgs', '-Xmx4G']`: a bare string that begins with
  `@` names a launch group a plugin exposes, `\@file` is the literal `@file`,
  and `command` and `workdir` take the same spelling. `assemble` replaces
  each reference and refuses one that names nothing, listing what there is,
  so a misspelt group stops the build rather than the launch. These were
  functions over a map of plugins, which made a config code where it could be
  data, typed the map as strings, and left the lookup in JS beside a merge
  that was already in Rust. A reference goes by plugin name, so **a name
  means one plugin**: two of a name are refused whether or not anything names
  them, and `.as('…')` renames one. None of it is in the format — a manifest
  holds the arguments, never a reference.
- **A plugin's type says what it is called and what it exposes.**
  `OpysPlugin<N, G>`: both are inferred from what `definePlugin` is given, the
  groups from the `launch` its `build` returns, and `defineConfig` infers the
  plugins and the launch line together. So `'@forge.jvmArg'` is a compile
  error at the place it is written. What the compiler cannot see — a plugin
  held as a bare `OpysPlugin`, strings from elsewhere, a plugin that is only
  sometimes in the list — is left to `assemble`, which checks every string
  whatever its type.
- **Build-time HTTP is one blocking request.** `opys-dev`'s `http::get` — no
  retry, no streaming, no resume. It has two siblings, each for one caller:
  `post_json`, because CurseForge takes its batched file lookup as a document,
  and `get_bytes`, because a modpack's index is inside its archive and has to
  be read to resolve it. Neither is a downloader. Resolvers run once against small JSON APIs;
  the install path has its own downloader in `opys-runtime`, and the two must
  never be confused for one another. The `net` feature is what a crate that fetches asks for; one that only
  merges or generates, like `opys-minecraft-serverlist`, takes `opys-dev`
  without it.
  `http::get_json` is the layer every resolver actually calls — GET, reject a
  non-2xx as `JsonGetError::Status`, decode. It lives in `opys-dev` rather
  than in each loader crate because the status check and the decode must have
  one spelling across the family; `http::get` stays underneath it for the
  callers that treat a status as data (a 404 for a platform a release doesn't
  ship).
- **A link is resolved once, by whoever publishes its hash — or by reading the
  file.** `opys-links` takes the URL a config author already has and turns it
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
  none, downloads the asset and hashes it. `opys-links`, `opys-dgpuj` and
  `opys-lwjgl3ify`'s mod jars all go through it, so none of them can ship an
  asset unverified — which is what lwjgl3ify's mod jar did while that choice
  was spelled per crate. `@opys/dev` once carried a TypeScript GitHub
  client beside this one, and `@opys/core` a retrying `fetch`; neither had a
  caller left inside opys, and a second implementation beside the Rust one is
  what drifted before, so both were deleted. An author with a release asset
  uses `links`.
- **A callback never crosses napi; its answers do.** `modrinth`, `curseforge`,
  `links` and `files` take a `to` function from the config author, and
  `authliberty` may take `hosts` as one. A closure cannot be handed to Rust,
  so each is split in two on the crate side: resolve to plain data, then build
  from that data plus what the callback returned (`file_artifacts(files,
paths)`). The wrapper's only job is the call in between. `files` is
  the same shape for a local directory: `scan_directory` says what is on
  disk, JS places each file with the author's `to` / `url`, and
  `scanned_files` hashes them and builds the artifacts.
- **Where a file goes is a function of the file, and is called `to`
  everywhere.** `to: (file) => '${game_directory}/mods/' + file.filename`.
  It was `path` on three plugins and `to` on the fourth, which also took a
  template string with placeholders of its own (`${rel}`). Those sat in one
  string beside the install-time `${…}`, read alike and were filled in at
  different times, and their names were a convention nothing checked. A
  function has a typed argument, and leaves one kind of `${…}` in a config.
- **A plugin takes one options object.** `forge({ version: '1.20.1' })`,
  `modrinth({ versions, to })`, `serverlist({ servers })`. They used to
  disagree — a version first here, a list first there, an object elsewhere —
  and `java` carried a runtime check for whoever guessed wrong. A config is
  plain JavaScript as often as not, so the old spellings are still refused at
  the call, by `pluginOptions`, with the one that works.
- **`files` and `links` are the two ways a file gets into a manifest by hand.**
  `links` takes what is already published and pins it; `files` takes what is
  on the author's disk. `files` carries by default — no `url` means a blob in
  the bundle — and points only when given a `url`. The two shapes are told
  apart by which field is present, not by a mode flag, and the easy spelling
  is the one that cannot go stale: an embedded file needs no server to stay
  up and no upload to remember.
- **Every plugin is a wrapper over the crate of the same name.** The last
  three to go were `bifrost` (a signer), the server list (an NBT encoder) and
  the scanner (a directory walk). Each was ported against output captured
  from the TypeScript it replaced: the same token, the same `servers.dat`,
  byte for byte. What a plugin keeps in JS is what only JS has — the author's
  closures, a `Date`, the plugin object. This is a statement about plugins,
  not about `lib/`: the cli is TypeScript throughout, and `@opys/dev` still
  carries `userDataDir`, the selectors and the config loader.
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
- **One addon, bounded by namespace.** `opys-napi` is a `cdylib` and stays
  off crates.io. Each of its modules exists exactly where a crate is declared
  as exposed, uses that crate, and names nothing it does not reach; the addon
  links nothing its modules do not use. A package that wraps takes its own
  namespace from `@opys/binding` and no other, read off the import itself.
- **Imports are declared.** Read from the TypeScript syntax tree: no package a
  `package.json` does not list (hoisting hides those), no subpath into another
  package, no relative path out of one. `lib/` may not use a devDependency.
- **The source-level principles that can be read syntactically**: a `class` in
  `lib/` is an `Error` or a named exemption; no `as unknown as`; a `…Wire`
  type is never `pub`; a file that names `HashMap` says why.
- **The hand-kept lists**, of which two are left: npm workspaces, in build
  order, and the smoke test that loads every addon. The release's own lists —
  a build, upload, download and publish step per binding, `cargo publish` per
  crate in dependency order, the version stamp — were four more, each missed
  at least once; they are derived now, from the directory listing and the
  dependency graph, and what is checked is that the workflow still derives
  them.

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
  artifacts?: BuildArtifact[]; // a manifest's, or carried: { file } / { bytes }
  vars?: ValDefs;
  launch?: Record<string, Valset | Val | string>; // named launch groups
}
```

The name and the group names are part of a plugin's type —
`OpysPlugin<'forge', 'command' | 'jvmArgs' | 'mainClass' | 'gameArgs'>` — and
are inferred; see _Invariants_.

- **Pure to construct.** `forge({ version: '1.20.1-best' })` returns `{ name, build }` with
  zero I/O; all network/fs work happens inside `build`.
- **`build` is the only hook** — build-phase only; plugins never run at launch.
- `definePlugin` returns the plugin with the post-processing methods
  attached — `exclude`, `addRule`, `removeIntegrity`, `updateFirst`,
  `updateMany` — each a selector plus what to do to the artifacts it matches,
  applied to what `build` returns. `as` gives it another name.

## Config & composition

```js
export default defineConfig(({ mode }) => ({
  output: 'game.opys',
  plugins: [forge({ version: '1.20.1-best' }), java({ version: '17' })],
  manifest: {
    command: '@forge.command',
    args: ['@forge.jvmArgs', '@forge.mainClass', '@forge.gameArgs'],
    workdir: '${game_directory}',
  },
  // What a player may set, for a launcher to draw. Goes into the head.
  options: options().feature('fullscreen').title('Fullscreen'),
  // `run` runs on the LAUNCH machine, every launch — the only correct
  // place for machine-specific paths. `userDataDir()` resolves the *build*
  // machine's home dir, so it must NEVER go in `manifest.vars` (baked into
  // the bundle); it belongs here.
  run: (manifest) => ({
    vars: { ...manifest.vars, root: userDataDir('my-pack') },
  }),
}));
```

- Flat `plugins: []` — no roles, no cardinality enforcement, and no two of
  one name.
- The engine merges artifacts (concat + last-wins dedup by normalized path) and
  vars (plugin-list order, last-wins, **warns** on plugin-vs-plugin collision).
  `manifest.vars` is the silent override layer — but it is baked into
  the bundle, so it takes build-time constants only, never machine-specific
  paths (those go in `run`).
- `command` / `args` / `workdir` are data: literals, and `'@plugin.group'`
  references to what a plugin exposes. The author owns arg order — there is
  no role-based default.
- A config takes its `command` from the loader, `'@forge.command'`, and not
  from `'@java.bin'`. Today the two are the same string. They are kept apart
  so that a loader which one day has to start through something of its own —
  a wrapper around `java` — can say so without any config changing.
- **One var, one owner.** e.g. only the `java` plugin emits
  `java_home` / `java_bin` / `java_runtime_dir`.
- **`java({ system: true })` ships no JDK, and says so with a feature.** It
  owns `java_bin` alone: `java` from `PATH`, or `${java_home}/bin/java` with
  the `custom_java` feature on, where `java_home` is a var the launcher
  hands in. It is a feature because a rule tests the OS and the features
  and nothing else; a manifest cannot ask whether a var was given. The
  plugin exposes `bin` and not `home`, there being no JDK whose home it
  could name, and any option that picks a JDK is refused beside `system`
  rather than ignored. This is the one place a manifest leaves what runs to
  the machine, and it is the author's explicit choice: nothing is looked up
  at install, it is only not pinned.
- `mode` is a build-time-only `ctx` value (`opys build --mode X`).

## Build & launch

- **`opys build`** — `resolveConfig` → run every plugin's `build(ctx)` in
  parallel → concat + dedup artifacts → merge vars → put `launch` together,
  each reference replaced by the group it names → gather the blobs the manifest names → `writeBundle`, with the config's `options` as the head. With
  no output named it prints the manifest as JSON instead: a view for reading
  and diffing, not something to install from, since the blobs are not in it.
- **`opys install`** — the same build and install as `launch`, stopping before
  the game. Where the manifest's own arguments name horno, it is run once with
  `-Dhorno.installOnly=true` prepended, because the loader's processors — and,
  pre-1.13, rewriting the client jar — happen on the launching machine and
  `install()` cannot do them. The flag goes on the JVM line, never into the
  manifest, which describes an installation and not a run of one: the launch
  is built as the manifest says and the flag is added to what comes back.
- **`opys launch`** — builds the manifest from the config, writes it and
  what it carries to a temporary bundle, and launches from that. `run(manifest) => Partial<Manifest>` is the
  launch-time patch, applied every launch (so e.g. `bifrost` mints a fresh
  token) as a shallow per-field override. The build/runtime wall holds — `cli`
  orchestrates `dev` + `runtime`, joined by that bundle; a _deployed_ launcher instead feeds `@opys/runtime` a published
  bundle with no `dev`.
- **`opys launch <bundle>` / `opys install <bundle>`** — that second path,
  from the command line: install and launch a built bundle as it is. No config
  is loaded, so there is no `run`; machine paths and credentials come
  from `--var key=value`.
- The runtime install pipeline is phased: resolve → scan → fetch → verify →
  extract → cleanup. A manifest comes from one of three sources — a bundle on
  disk, a URL to one (downloaded whole first), or memory — and `prepare`
  resolves it once for both the install and the launch spec. A failure is
  told apart by its `code` — `network`, `integrity`, `extraction`, `manifest`,
  `io`, `cancelled`, `other` — which the crate reports as data
  (`ErrorReport`) and `@opys/runtime` rebuilds as a `RuntimeError`, with
  `NetworkError` / `IntegrityError` / `ExtractionError` carrying the
  particulars. Nothing reads the wording of a message.

## Working in the repo

- npm workspaces. `npm run build` / `npm run typecheck` / `npm test` fan out
  across every package.
- **`npm test`** runs the unit suites (`tests/unit`). CI
  (`.github/workflows/ci.yml`) runs the architecture check, `cargo test` on
  Linux (and `opys-runtime`'s on Windows), and `build` + `typecheck` + `test`; every `tsconfig` that has tests includes `tests/**`, so
  `typecheck` covers test code too.
- **`npm run test:int`** runs the live-network integration suite
  (`tests/integration`) against the real Mojang / Forge / Adoptium /
  CurseForge APIs. It needs network and a `CURSEFORGE_TOKEN`, so it is run
  **locally only** — never in CI.
- **`cargo test --workspace`** runs the Rust suites. Behaviour ported into a
  crate is tested there, not twice: `@opys/java`'s JS tests cover only what
  the wrapper adds (the plugin closure, the typed surface), while the
  resolvers are exercised in `crates/opys-java/tests`.
- **`scripts/launch-matrix`** is the check that a manifest _runs_: a bundle
  per case, installed and launched cold and warm, passed when the game owns a
  window and stays up. It is too heavy for a push, so it runs by hand only —
  locally, or through `.github/workflows/launch-matrix.yml`, which launches a
  handful of versions unless asked for the full list. What it guards also
  moves without a commit here: the published documents, horno. A change to a loader crate, the runtime or horno is not verified until
  the cases it touches have been launched.
- **`npm run architecture`** holds the tree to
  `scripts/architecture/rules.mjs`. It reads manifests and sources only, so it
  needs nothing built; it runs on every commit and first in CI.
- **`node scripts/smoke-napi.mjs`** loads the addon and crosses each
  namespace once — the check that it is actually built and loadable.
