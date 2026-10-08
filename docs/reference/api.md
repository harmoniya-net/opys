# API

This page is a lookup: which package exports what. Each section names one
published package, installs it, and lists its public exports with the kind of
each. For how to use a package, follow the link at the top of its section.
`@opys/minecraft` re-exports most of the others, and its section says which. The
`opys` command exports nothing.

## Lifecycle

`opys build` and `opys launch` run the same steps up to the point where they
diverge. See [Concepts](/guide/concepts) for the manifest and the two machines.

### `opys build`

1. Load the config file and resolve it. The function form receives `{ mode }`.
2. Run every plugin's `build(ctx)` in parallel. Each returns a `Contribution`.
3. Evaluate `manifest.command`, `args`, `workdir` and `envs` over the plugins'
   launch groups.
4. Merge the contributions into one manifest and the table of blobs it names.
   Any warnings from the merge go to the log.
5. With an output file, write the bundle to it. With none, print the manifest as
   JSON, which has no blobs in it.

### `opys launch`

1. Load and resolve the config, as in steps 1 to 4 of `opys build`. The manifest
   is built in memory, and no bundle is written. (`opys launch <bundle>` instead
   takes a bundle as it is. No config is loaded, so steps 1 to 3 do not happen,
   and `--var` supplies the launch-time values.)
2. Apply `runClient`: the manifest is shallow-merged with what `runClient`
   returns, one field at a time. A returned `vars` replaces the manifest's
   `vars` whole, which is why configs spread `manifest.vars` into it.
3. Check that every var is a string or a list of conditional values.
4. Install the manifest with `install` from `@opys/runtime`. Its progress events
   are the phases `resolve`, `download`, `verify`, `extract` and `sweep`, and
   `download` also reports each file as `download:start`, `download:bytes` and
   `download:done`.
5. Spawn the game with `launch`, with `install: false`, inheriting stdio, and wait
   for it to exit.

## @opys/mojang-rules

The Mojang-standard rule format: types and two factories. It has no evaluator and
no dependencies, so either side of the build and runtime split can name the
contract. [Plugin page](/plugins/mojang-rules).

```sh
npm install @opys/mojang-rules
```

| Export              | Kind     | Meaning                                                              |
| ------------------- | -------- | -------------------------------------------------------------------- |
| `OsName`            | type     | `linux`, `windows` or `osx`.                                         |
| `OsArch`            | type     | `x86`, `x86_64`, `arm`, `aarch64` or `any`.                          |
| `OsOptions`         | type     | The platform a rule is evaluated against: `name`, `version`, `arch`. |
| `OsConstraint`      | type     | The `os` part of a rule. Each field is optional and independent.     |
| `FeatureConstraint` | type     | A feature name mapped to the boolean it must have.                   |
| `RuleAction`        | type     | `allow` or `disallow`.                                               |
| `MojangRule`        | type     | One rule: an action with an optional `os` or `features` constraint.  |
| `MojangRuleset`     | type     | A list of `MojangRule`.                                              |
| `emptyRuleset`      | function | An empty `MojangRuleset`.                                            |
| `allowOsRuleset`    | function | A `MojangRuleset` that allows one OS name.                           |

## @opys/mojang

Parsers for the Mojang protocol: the version manifest, the client version JSON,
libraries, asset indexes and Maven coordinates. It performs no I/O, so the caller
does the fetching. Its rules are strict Mojang form, with no opys shorthand.
[Plugin page](/plugins/mojang).

```sh
npm install @opys/mojang
```

| Export                                                                                                            | Kind     | Meaning                                                                              |
| ----------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `VERSION_MANIFEST_URL`                                                                                            | constant | Mojang's `version_manifest_v2.json` URL.                                             |
| `LEGACY_JVM_ARGS`                                                                                                 | constant | The JVM arguments a legacy `minecraftArguments` version implies.                     |
| `OsName`, `OsArch`, `OsOptions`, `OsConstraint`, `FeatureConstraint`, `RuleAction`, `MojangRule`, `MojangRuleset` | type     | Re-exported from `@opys/mojang-rules`.                                               |
| `emptyRuleset`, `allowOsRuleset`                                                                                  | function | Re-exported from `@opys/mojang-rules`.                                               |
| `MavenCoord`                                                                                                      | type     | A Maven coordinate: group, artifact, and optional version, classifier and packaging. |
| `Artifact`                                                                                                        | type     | A downloadable file: path, `sha1`, size and URL.                                     |
| `Library`                                                                                                         | type     | A library: its coordinate, rules, artifact, and whether it is native.                |
| `MojangArgValue`                                                                                                  | type     | A launch argument: a string, or a rule-gated value.                                  |
| `Arguments`                                                                                                       | type     | Game and JVM arguments, and whether they came from the legacy field.                 |
| `JavaVersion`                                                                                                     | type     | The Java component and major version a client asks for.                              |
| `AssetObject`                                                                                                     | type     | One asset: its hash and size.                                                        |
| `AssetManifest`                                                                                                   | type     | The objects of an asset index, and the layout flags of the legacy ones.              |
| `AssetIndex`                                                                                                      | type     | The reference to an asset index from a client: id, `sha1`, size and URL.             |
| `DownloadsFile`                                                                                                   | type     | A downloadable file with `sha1`, size and URL.                                       |
| `Downloads`                                                                                                       | type     | The client, mappings and server files a version lists.                               |
| `LoggingFile`                                                                                                     | type     | The logging configuration file a version lists.                                      |
| `LoggingClient`                                                                                                   | type     | The client logging entry: argument, file and type.                                   |
| `Logging`                                                                                                         | type     | The logging section of a version.                                                    |
| `ClientMetadata`                                                                                                  | type     | Version metadata: type, times, launcher minimum and compliance level.                |
| `Client`                                                                                                          | type     | A parsed version JSON.                                                               |
| `Version`                                                                                                         | type     | One entry of the version manifest.                                                   |
| `VersionManifest`                                                                                                 | type     | The version manifest: latest release and snapshot, and all versions.                 |
| `parseClient`                                                                                                     | function | Parse a version JSON into a `Client`.                                                |
| `parseLibraries`                                                                                                  | function | Parse a list of library entries.                                                     |
| `parseArguments`                                                                                                  | function | Parse an arguments field, modern or legacy.                                          |
| `mergeArgs`                                                                                                       | function | Merge a patch version's arguments onto a base version's.                             |
| `parseAssetManifest`                                                                                              | function | Parse an asset index.                                                                |
| `parseVersionManifest`                                                                                            | function | Parse the version manifest.                                                          |
| `findVersion`                                                                                                     | function | Find a version by id, or `undefined`.                                                |
| `latestRelease`                                                                                                   | function | The current release version. Throws if the manifest has none.                        |
| `assetUrl`                                                                                                        | function | The download URL of an asset, given its hash.                                        |
| `assetPath`                                                                                                       | function | The path of an asset within the objects directory, given its hash.                   |
| `parseMaven`                                                                                                      | function | Parse a Maven coordinate string.                                                     |
| `encodeMaven`                                                                                                     | function | Write a Maven coordinate as a string.                                                |
| `isNativeMaven`                                                                                                   | function | Whether a coordinate is a native library.                                            |
| `mavenMatchesIgnoringVersion`                                                                                     | function | Compare two coordinates on every field except the version.                           |
| `decodeRuleset`                                                                                                   | function | Decode a strict Mojang ruleset. Shorthand is rejected.                               |
| `encodeRuleset`                                                                                                   | function | Encode a `MojangRuleset`.                                                            |
| `satisfiesRuleset`                                                                                                | function | Whether a strict ruleset holds on a platform and feature set.                        |
| `satisfiesRule`                                                                                                   | function | Whether one rule holds on a platform and feature set.                                |
| `satisfiesOs`                                                                                                     | function | Whether an `os` constraint matches a platform.                                       |
| `satisfiesFeatures`                                                                                               | function | Whether a feature constraint matches a feature set.                                  |

## @opys/core

The manifest contract: the domain types, the bundle reader and writer, and the
rule and variable helpers. It is the reference implementation of the format, and
the only package both sides of the build and runtime split depend on.
[Plugin page](/plugins/core).

```sh
npm install @opys/core
```

| Export                                                                                                            | Kind     | Meaning                                                                             |
| ----------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `BUNDLE_FORMAT`                                                                                                   | constant | The bundle format number this build reads and writes.                               |
| `OsName`, `OsArch`, `OsOptions`, `OsConstraint`, `FeatureConstraint`, `RuleAction`, `MojangRule`, `MojangRuleset` | type     | Re-exported from `@opys/mojang-rules`.                                              |
| `emptyRuleset`, `allowOsRuleset`                                                                                  | function | Re-exported from `@opys/mojang-rules`.                                              |
| `Rule`                                                                                                            | type     | A rule as written in a manifest: a shorthand string, or a `MojangRule`.             |
| `Ruleset`                                                                                                         | type     | One `Rule`, or an array of them.                                                    |
| `Source`                                                                                                          | type     | Where an artifact comes from: `{ url }` or `{ blob }`.                              |
| `BlobSource`                                                                                                      | type     | Where a blob's bytes are on the build machine: `{ file }` or `{ bytes }`.           |
| `Blobs`                                                                                                           | type     | A table from blob id to `BlobSource`.                                               |
| `HashEntry`                                                                                                       | type     | One hash: `sha1`, `sha256` or `md5`.                                                |
| `Integrity`                                                                                                       | type     | One `HashEntry`, or a list of them.                                                 |
| `HashAlgo`                                                                                                        | type     | The names of the hash algorithms.                                                   |
| `ExtractPick`                                                                                                     | type     | An extract rule that takes one named file.                                          |
| `ExtractScan`                                                                                                     | type     | An extract rule that takes the entries matching a glob.                             |
| `ExtractDump`                                                                                                     | type     | An extract rule that unpacks the whole archive.                                     |
| `ExtractRule`                                                                                                     | type     | One of the three extract rules.                                                     |
| `Artifact`                                                                                                        | type     | One file in a manifest: path, source, and optional rules, hashes and extract rules. |
| `ValObject`                                                                                                       | type     | The object form of a launch value: `value`, with optional `rules`.                  |
| `Val`                                                                                                             | type     | A launch value: a string, or a `ValObject`.                                         |
| `Valset`                                                                                                          | type     | A list of `Val`.                                                                    |
| `ConditionalVal`                                                                                                  | type     | A variable value with rules attached.                                               |
| `ValDefs`                                                                                                         | type     | The variables of a manifest, by name.                                               |
| `Launch`                                                                                                          | type     | The launch command, working directory, arguments and environment.                   |
| `Manifest`                                                                                                        | type     | The whole manifest: vars, launch, artifacts and restrict globs.                     |
| `Head`                                                                                                            | type     | A bundle's first entry: the manifest without its artifacts, plus `format`.          |
| `decodeManifest`                                                                                                  | function | Decode a wire-form manifest object into a `Manifest`.                               |
| `encodeManifest`                                                                                                  | function | Encode a `Manifest` into its wire form.                                             |
| `parseManifest`                                                                                                   | function | Parse a JSON string into a `Manifest`.                                              |
| `filterManifest`                                                                                                  | function | Drop the artifacts whose rules exclude a platform and feature set.                  |
| `resolveVars`                                                                                                     | function | Resolve a var map so its values can refer to each other.                            |
| `interpolate`                                                                                                     | function | Substitute `${name}` references in a template from a var map.                       |
| `resolvedArgs`                                                                                                    | function | The launch arguments for a platform and feature set, as strings.                    |
| `resolvedEnvs`                                                                                                    | function | The launch environment for a platform and feature set.                              |
| `satisfiesRuleset`                                                                                                | function | Whether a ruleset holds. Accepts shorthand rules.                                   |
| `globBase`                                                                                                        | function | The fixed directory prefix of a glob.                                               |
| `globToRegexSource`                                                                                               | function | A glob as the source of a regular expression.                                       |
| `globToRegex`                                                                                                     | function | A glob as a `RegExp`.                                                               |
| `blobId`                                                                                                          | function | The blob id of some bytes: their hex sha256.                                        |
| `hashBlobFile`                                                                                                    | function | The blob id and size of a file on disk.                                             |
| `writeBundle`                                                                                                     | function | Write a manifest and its blobs as a bundle file.                                    |
| `readBundle`                                                                                                      | function | Read the whole manifest from a bundle.                                              |
| `readBundleHead`                                                                                                  | function | Read a bundle's head, leaving its artifact list unread.                             |
| `sourceUrl`                                                                                                       | function | Build a `url` source.                                                               |
| `sourceBlob`                                                                                                      | function | Build a `blob` source.                                                              |
| `blobFile`                                                                                                        | function | Build a blob source from a file on the build machine.                               |
| `blobBytes`                                                                                                       | function | Build a blob source from bytes. They are stored base64-encoded.                     |
| `extractPick`                                                                                                     | function | Build an `ExtractPick`.                                                             |
| `extractScan`                                                                                                     | function | Build an `ExtractScan`.                                                             |
| `extractDump`                                                                                                     | function | Build an `ExtractDump`.                                                             |
| `extractRules`                                                                                                    | function | An artifact's extract rules as a list, whichever form they were written in.         |
| `valValues`                                                                                                       | function | The strings a `Val` contributes. Read a `Val` with this, not `.value`.              |
| `deduplicateArtifacts`                                                                                            | function | Deduplicate artifacts by normalized path. The later one wins.                       |
| `parseShortRuleset`                                                                                               | function | Expand shorthand rules into a `MojangRuleset`.                                      |

## @opys/dev

The build SDK: `defineConfig`, the build engine, the plugin contract, the `files`
plugin and `userDataDir`. The contribution merge itself is in Rust, and this
package calls it. [Plugin page](/plugins/dev).

```sh
npm install -D @opys/dev
```

| Export               | Kind     | Meaning                                                                                                    |
| -------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `BuildContext`       | type     | What a plugin's `build` receives: `log`, `configDir` and `mode`.                                           |
| `LaunchGroups`       | type     | Named launch fragments a plugin exposes to the config's accessors.                                         |
| `Contribution`       | type     | What a plugin's `build` returns: artifacts, blobs, vars, launch groups and envs.                           |
| `OpysPlugin`         | type     | A plugin: a `name` and a `build` function.                                                                 |
| `ArtifactPatch`      | type     | A partial artifact, or a function from an artifact to one.                                                 |
| `ChainablePlugin`    | type     | A plugin with the fluent methods: `exclude`, `addRule`, `removeIntegrity`, `updateFirst` and `updateMany`. |
| `definePlugin`       | function | Turn a plugin object into a `ChainablePlugin`, with the fluent methods.                                    |
| `PluginMap`          | type     | Plugin name to its launch groups, as the config's accessors receive it.                                    |
| `ArgItem`            | type     | One entry of the config's `args`.                                                                          |
| `OpysManifestConfig` | type     | The `manifest` block of a config.                                                                          |
| `OpysConfig`         | type     | A config: `output`, `plugins`, `manifest` and `runClient`.                                                 |
| `OpysConfigContext`  | type     | The context a config function receives: `mode`.                                                            |
| `OpysConfigInput`    | type     | A config, or a function returning one.                                                                     |
| `defineConfig`       | function | Identity helper for the default export of `opys.config.mjs`.                                               |
| `resolveConfig`      | function | Turn a config input into an `OpysConfig`.                                                                  |
| `Built`              | type     | A build's result: the manifest and its blobs.                                                              |
| `buildManifest`      | function | Run every plugin's `build`, then merge the results into a `Built`.                                         |
| `Selector`           | type     | Which artifacts a fluent method applies to: a glob, globs, or a predicate.                                 |
| `RulesetInput`       | type     | A ruleset in any form `parseShortRuleset` accepts.                                                         |
| `matchesSelector`    | function | Whether a selector matches an artifact.                                                                    |
| `userDataDir`        | function | The per-user data directory for an application, by OS convention.                                          |
| `LocalFile`          | type     | A file found by `files`: `rel`, `dir`, `filename`, `abs` and `size`.                                       |
| `FileTemplate`       | type     | A `to` or `url` value: a template string, or a function of the file.                                       |
| `EmbeddedFiles`      | type     | `files` options with no `url`. The files are carried in the bundle.                                        |
| `PublishedFiles`     | type     | `files` options with a `url`. The files are pointed at.                                                    |
| `FilesOptions`       | type     | `EmbeddedFiles` or `PublishedFiles`.                                                                       |
| `files`              | function | Every file under a local directory, as artifacts.                                                          |
| `LoaderTemplate`     | type     | The launch shape shared by the vanilla and Forge-family loaders.                                           |
| `launchGroups`       | function | Project a loader template's launch into named groups.                                                      |

## @opys/runtime

Installs a manifest and launches it. It depends on `@opys/core` alone, and a
launcher can embed it without the build side. [Plugin page](/plugins/runtime).

```sh
npm install @opys/runtime
```

| Export             | Kind     | Meaning                                                                         |
| ------------------ | -------- | ------------------------------------------------------------------------------- |
| `ManifestSource`   | type     | Where to install from: `{ bundle }`, `{ url }`, or `{ manifest, blobs }`.       |
| `InstallProgress`  | type     | A progress event, discriminated by `phase`.                                     |
| `InstallOptions`   | type     | Platform, vars, concurrency, integrity check, features and a progress callback. |
| `LaunchOptions`    | type     | Platform, features, vars, working directory, and install options or `false`.    |
| `RuntimeErrorCode` | type     | The codes a `RuntimeError` can carry.                                           |
| `RuntimeError`     | class    | A runtime failure, with a `code`.                                               |
| `NetworkError`     | class    | A `RuntimeError` for a failed download, with the URL and status.                |
| `IntegrityError`   | class    | A `RuntimeError` for a failed hash check, with the paths.                       |
| `ExtractionError`  | class    | A `RuntimeError` for a failed extraction, with the artifact path.               |
| `InstallError`     | type     | `NetworkError`, `IntegrityError` or `ExtractionError`.                          |
| `translateError`   | function | Turn an error thrown by the binding into the matching typed error.              |
| `install`          | function | Install a manifest source.                                                      |
| `buildLaunch`      | function | The `LaunchSpec` for a source, without installing or spawning.                  |
| `prepare`          | function | Install, then return the `LaunchSpec`. The source is read once.                 |
| `spawnLaunch`      | function | Spawn a `LaunchSpec` with this process's stdio.                                 |
| `launch`           | function | `prepare`, then `spawnLaunch`. Returns the child process.                       |
| `currentPlatform`  | function | The platform this process runs on, as `OsOptions`.                              |
| `OsOptions`        | type     | The platform a launch is evaluated against.                                     |
| `LaunchSpec`       | type     | The command, arguments, working directory and environment to spawn.             |

## @opys/minecraft-vanilla

Vanilla Minecraft as manifest artifacts: the client jar, libraries, assets and
launch. It also holds the mappers that every loader in the family shares.
[Plugin page](/plugins/minecraft-vanilla).

```sh
npm install @opys/minecraft-vanilla
```

| Export                 | Kind     | Meaning                                                                                 |
| ---------------------- | -------- | --------------------------------------------------------------------------------------- |
| `VERSION_MANIFEST_URL` | constant | Re-exported from `@opys/mojang`.                                                        |
| `MinecraftOptions`     | type     | The version to resolve, and an optional version-manifest URL.                           |
| `ClasspathEntry`       | type     | A classpath candidate: its path, and the rules that include it.                         |
| `LaunchParts`          | type     | A launch, with its JVM arguments, main class and game arguments kept apart.             |
| `MinecraftTemplate`    | type     | Vanilla's artifacts, vars, launch parts and per-OS classpath arms.                      |
| `FetchedClient`        | type     | A version-manifest entry with the version JSON it points at.                            |
| `resolveMinecraft`     | function | Resolve vanilla Minecraft into a template.                                              |
| `fetchClient`          | function | Look a version up and fetch its version JSON.                                           |
| `clientToTemplate`     | function | Map a `Client` that a loader already resolved.                                          |
| `fetchVersionManifest` | function | Fetch the version manifest.                                                             |
| `fetchAssetManifest`   | function | Fetch and parse an asset index.                                                         |
| `mapClientToTemplate`  | function | The pure half of `clientToTemplate`: a `Client` and asset manifest in, a template out.  |
| `mapClientJar`         | function | The artifact for a client's jar.                                                        |
| `libraryToArtifact`    | function | The artifact for one library.                                                           |
| `mapLibraries`         | function | The artifacts for a list of libraries.                                                  |
| `mapAssetIndex`        | function | The artifact for an asset index file.                                                   |
| `mapAssetObjects`      | function | The artifacts for the objects of an asset index, placed where its game looks.           |
| `buildClasspath`       | function | The per-OS `${classpath}` arms. Each one ends with the client jar, after every library. |
| `buildLaunch`          | function | `LaunchParts` from a main class and its arguments.                                      |
| `minecraft`            | function | The plugin: vanilla client, libraries and assets.                                       |

## @opys/forge

The Forge mod loader, from 1.1 on. It resolves a build against the document
index and folds it onto its vanilla base. [Plugin page](/plugins/forge).

```sh
npm install @opys/forge
```

| Export                | Kind     | Meaning                                                           |
| --------------------- | -------- | ----------------------------------------------------------------- |
| `DEFAULT_FORGE_INDEX` | constant | The canonical document index base URL.                            |
| `ForgeOptions`        | type     | The version to resolve, and optional index and manifest URLs.     |
| `ForgeRelease`        | type     | A Minecraft version with its chosen Forge build and document URL. |
| `ForgeTemplate`       | type     | Forge's artifacts, vars, launch parts and per-OS classpath arms.  |
| `resolveForge`        | function | Resolve a Forge build into a template.                            |
| `resolveForgeVersion` | function | Resolve a version, alias or build id against the index.           |
| `forge`               | function | The plugin.                                                       |

## @opys/neoforge

The NeoForge mod loader. It is built the same way as Forge, from its own index.
[Plugin page](/plugins/neoforge).

```sh
npm install @opys/neoforge
```

| Export                   | Kind     | Meaning                                                              |
| ------------------------ | -------- | -------------------------------------------------------------------- |
| `DEFAULT_NEOFORGE_INDEX` | constant | The canonical document index base URL.                               |
| `NeoForgeOptions`        | type     | The version to resolve, and optional index and manifest URLs.        |
| `NeoForgeRelease`        | type     | A Minecraft version with its chosen NeoForge build and document URL. |
| `NeoForgeTemplate`       | type     | NeoForge's artifacts, vars, launch parts and per-OS classpath arms.  |
| `resolveNeoForge`        | function | Resolve a NeoForge build into a template.                            |
| `resolveNeoForgeVersion` | function | Resolve a version, alias or build id against the index.              |
| `neoforge`               | function | The plugin.                                                          |

## @opys/fabric

The Fabric mod loader. [Plugin page](/plugins/fabric).

```sh
npm install @opys/fabric
```

| Export                 | Kind     | Meaning                                                                              |
| ---------------------- | -------- | ------------------------------------------------------------------------------------ |
| `DEFAULT_FABRIC_META`  | constant | The canonical Fabric Meta base URL.                                                  |
| `FabricOptions`        | type     | The game version, an optional loader version, and optional source and manifest URLs. |
| `FabricRelease`        | type     | A game version with its loader version and profile URL.                              |
| `FabricTemplate`       | type     | Fabric's artifacts, vars, launch parts and per-OS classpath arms.                    |
| `resolveFabric`        | function | Resolve a Fabric profile into a template.                                            |
| `resolveFabricVersion` | function | Resolve a game version, and optionally a loader, to a Fabric release.                |
| `fabric`               | function | The plugin.                                                                          |

## @opys/cleanroom

The Cleanroom loader, a successor to Forge for Minecraft 1.12.2. Its document is a
complete version, so there is no fold. [Plugin page](/plugins/cleanroom).

```sh
npm install @opys/cleanroom
```

| Export                    | Kind     | Meaning                                                             |
| ------------------------- | -------- | ------------------------------------------------------------------- |
| `DEFAULT_CLEANROOM_INDEX` | constant | The canonical document index base URL.                              |
| `CleanroomOptions`        | type     | The version to resolve, and an optional index URL.                  |
| `CleanroomRelease`        | type     | A Minecraft version with its Cleanroom release and document URL.    |
| `CleanroomTemplate`       | type     | The game's artifacts, vars, launch parts and per-OS classpath arms. |
| `resolveCleanroom`        | function | Resolve a Cleanroom release into a template.                        |
| `resolveCleanroomVersion` | function | Resolve a version, alias or release tag against the index.          |
| `cleanroom`               | function | The plugin.                                                         |

## @opys/lwjgl3ify

lwjgl3ify, Forge 1.7.10 on LWJGL 3. It adds the lwjgl3ify and UniMixins jars to
`mods/`, which the version document cannot name. [Plugin page](/plugins/lwjgl3ify).

```sh
npm install @opys/lwjgl3ify
```

| Export                    | Kind     | Meaning                                                                                                       |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_LWJGL3IFY_INDEX` | constant | The canonical document index base URL.                                                                        |
| `UnimixinsOptions`        | type     | Which UniMixins release to install, and from which repository.                                                |
| `Lwjgl3ifyOptions`        | type     | The version to resolve, plus an optional index URL, the mod repository, token, API base and UniMixins option. |
| `Lwjgl3ifyRelease`        | type     | A Minecraft version with its lwjgl3ify release and document URL.                                              |
| `Lwjgl3ifyTemplate`       | type     | The game's artifacts, including the `mods/` jars, plus vars, launch parts and classpath arms.                 |
| `resolveLwjgl3ify`        | function | Resolve an lwjgl3ify release into a template.                                                                 |
| `resolveLwjgl3ifyVersion` | function | Resolve a version, alias or release tag against the index.                                                    |
| `lwjgl3ify`               | function | The plugin.                                                                                                   |

## @opys/java

JDK provisioning for Temurin, Zulu and GraalVM CE. It owns the `java_home`,
`java_bin` and `java_runtime_dir` vars. [Plugin page](/plugins/java).

```sh
npm install @opys/java
```

| Export                  | Kind     | Meaning                                                        |
| ----------------------- | -------- | -------------------------------------------------------------- |
| `SupportedArch`         | type     | `x86_64` or `aarch64`.                                         |
| `Platform`              | type     | An OS and arch pair a vendor resolver fetches for.             |
| `VendorBinary`          | type     | One resolved JDK archive for one platform.                     |
| `VendorRelease`         | type     | A resolved JDK release: its label, major version and binaries. |
| `JavaVendor`            | type     | `temurin`, `zulu` or `graalvm`.                                |
| `JavaOptions`           | type     | The JDK version, vendor, platforms, API base and token.        |
| `ResolveTemurinOptions` | type     | Platforms and API base for Temurin.                            |
| `ResolveZuluOptions`    | type     | Platforms and API base for Zulu.                               |
| `ResolveGraalvmOptions` | type     | Platforms, token and API base for GraalVM CE.                  |
| `JavaTemplate`          | type     | The JDK's artifacts, vars and release.                         |
| `DEFAULT_PLATFORMS`     | constant | The platforms every resolver targets by default.               |
| `resolveJava`           | function | Resolve a JDK for a vendor and version into a template.        |
| `resolveTemurin`        | function | Resolve an Eclipse Temurin release.                            |
| `resolveZulu`           | function | Resolve an Azul Zulu release.                                  |
| `resolveGraalvm`        | function | Resolve a GraalVM CE release.                                  |
| `java`                  | function | The plugin.                                                    |

## @opys/modrinth

Mod files and `.mrpack` modpacks from Modrinth. The `path` function is the
config's, and a modpack is resolved to a loader and then composed here.
[Plugin page](/plugins/modrinth).

```sh
npm install @opys/modrinth
```

| Export                   | Kind     | Meaning                                                                                        |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------- |
| `MODRINTH_API`           | constant | Modrinth's public API base.                                                                    |
| `ModrinthFileInfo`       | type     | What the `path` callback receives: filename, version and project ids, version number and size. |
| `ModrinthPath`           | type     | The `path` callback: a file's info to its install path.                                        |
| `ModrinthVersionRef`     | type     | A version id, or a version URL.                                                                |
| `ModrinthOptions`        | type     | The `path` callback and an optional API base.                                                  |
| `MrpackSide`             | type     | `required`, `optional` or `unsupported`.                                                       |
| `MrpackEnv`              | type     | A file's client and server side flags in a `.mrpack`.                                          |
| `MrpackFile`             | type     | One file entry in `modrinth.index.json`.                                                       |
| `MrpackIndex`            | type     | The parsed `modrinth.index.json`.                                                              |
| `ModrinthModpackRef`     | type     | A modpack version id, version URL, or `.mrpack` URL.                                           |
| `LoaderSpec`             | type     | The loader a modpack asks for: Fabric, Forge, NeoForge or vanilla.                             |
| `ResolvedModpack`        | type     | A modpack's index, loader, file artifacts and overrides artifact.                              |
| `ModrinthPluginOptions`  | type     | `ModrinthOptions` plus the version references.                                                 |
| `ModrinthModpackOptions` | type     | An API base, and an optional function that builds the pack's loader.                           |
| `resolveModrinth`        | function | Resolve version references into artifacts, each placed by `path`.                              |
| `modrinth`               | function | The plugin for mod files.                                                                      |
| `loaderSpec`             | function | Map a `.mrpack`'s `dependencies` to a `LoaderSpec`. Quilt is rejected.                         |
| `resolveModrinthModpack` | function | Resolve a modpack into its files, overrides and loader, without composing the loader.          |
| `modrinthModpack`        | function | The plugin for a whole modpack: its loader, its files and its overrides.                       |

## @opys/curseforge

Mod files and modpack archives from CurseForge. An API key is needed at build
time only. [Plugin page](/plugins/curseforge).

```sh
npm install @opys/curseforge
```

| Export                      | Kind     | Meaning                                                                               |
| --------------------------- | -------- | ------------------------------------------------------------------------------------- |
| `CURSEFORGE_API`            | constant | CurseForge's public API base.                                                         |
| `CurseForgeFileInfo`        | type     | What the `path` callback receives: filename, file and project ids, and size.          |
| `CurseForgeFileMeta`        | type     | A resolved file, with its download URL and optional `sha1`.                           |
| `CurseForgePath`            | type     | The `path` callback: a file's info to its install path.                               |
| `CurseForgeFileRef`         | type     | A file id, or a file URL.                                                             |
| `CurseForgeApiOptions`      | type     | The API key, and an optional API base.                                                |
| `CurseForgeOptions`         | type     | `CurseForgeApiOptions` plus the `path` callback.                                      |
| `CurseforgeModLoader`       | type     | A loader entry in a modpack's `manifest.json`.                                        |
| `CurseforgeManifestFile`    | type     | A file reference in a modpack's `manifest.json`.                                      |
| `CurseforgeModpackManifest` | type     | The parsed `manifest.json` of a modpack.                                              |
| `LoaderSpec`                | type     | The loader a modpack asks for. Same shape as the one in `@opys/modrinth`.             |
| `ResolvedCurseforgeModpack` | type     | A modpack's manifest, loader, file artifacts and overrides artifact.                  |
| `CurseforgePluginOptions`   | type     | `CurseForgeOptions` plus the file references.                                         |
| `CurseforgeModpackOptions`  | type     | The API key, the modpack file, and an optional function that builds its loader.       |
| `parseFileRef`              | function | The numeric file id a reference names.                                                |
| `fetchCurseforgeFiles`      | function | Fetch metadata for file ids in batches.                                               |
| `resolveCurseforge`         | function | Resolve file references into artifacts, each placed by `path`.                        |
| `curseforge`                | function | The plugin for mod files.                                                             |
| `loaderSpecFromManifest`    | function | Map a modpack manifest to a `LoaderSpec`, from its primary loader.                    |
| `resolveCurseforgeModpack`  | function | Resolve a modpack into its files, overrides and loader, without composing the loader. |
| `curseforgeModpack`         | function | The plugin for a whole modpack.                                                       |

## @opys/link

Turns a pasted link into a pinned file. A link to GitHub, GitLab, Modrinth or
CurseForge is pinned by its provider. Any other URL is downloaded and hashed.
[Plugin page](/plugins/link).

```sh
npm install @opys/link
```

| Export                 | Kind     | Meaning                                                                              |
| ---------------------- | -------- | ------------------------------------------------------------------------------------ |
| `LinkProvider`         | type     | `github`, `gitlab`, `modrinth`, `curseforge` or `url`.                               |
| `ResolvedFile`         | type     | A resolved link: the link, provider, filename, download URL, size and optional hash. |
| `LinkOptions`          | type     | Tokens and API bases for the providers.                                              |
| `LinkPath`             | type     | The function that gives each resolved file its install path.                         |
| `resolveLinks`         | function | Resolve links to pinned files, in the order given.                                   |
| `resolveLinkArtifacts` | function | Resolve links into artifacts, each placed by `path`.                                 |
| `LinksPluginOptions`   | type     | `LinkOptions` plus `path` and the links.                                             |
| `links`                | function | The plugin. Named `links` in the config.                                             |

## @opys/authliberty

AuthLiberty, an authlib-injector `-javaagent` that points Minecraft's auth,
account, session and services hosts elsewhere. [Plugin page](/plugins/authliberty).

```sh
npm install @opys/authliberty
```

| Export                      | Kind     | Meaning                                                                              |
| --------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `AuthLibertyServer`         | type     | The four server kinds: `auth`, `account`, `session` and `services`.                  |
| `AuthLibertyHostMap`        | type     | Replacement hosts, by server kind. A missing key keeps Mojang's host.                |
| `AuthLibertyHosts`          | type     | A host map, or a function from server kind to URL.                                   |
| `ResolveAuthLibertyOptions` | type     | The GitLab project, instance and token.                                              |
| `AuthLibertyOptions`        | type     | The version, the hosts, and the GitLab options.                                      |
| `AuthLibertyRelease`        | type     | A resolved agent jar: version, filename, URL, size, optional hash and creation time. |
| `AuthLibertyTemplate`       | type     | The agent jar artifact, the `-javaagent` and `-D` JVM arguments, and the release.    |
| `resolveAuthliberty`        | function | Resolve AuthLiberty into a template.                                                 |
| `resolveAuthLibertyVersion` | function | Resolve a version, or `latest`, against the GitLab package registry.                 |
| `authliberty`               | function | The plugin.                                                                          |

## @opys/bifrost

Mints a Bifrost-compatible Ed25519 token locally, for `runClient` to launch
against a self-hosted Yggdrasil server. [Plugin page](/plugins/bifrost).

```sh
npm install @opys/bifrost
```

| Export                | Kind     | Meaning                                                                     |
| --------------------- | -------- | --------------------------------------------------------------------------- |
| `BifrostOptions`      | type     | The private key, username, UUID, and optional lifetime and issue time.      |
| `BifrostAuth`         | type     | The username, the dashless UUID and the signed token.                       |
| `DEFAULT_TTL_SECONDS` | constant | The token lifetime when `expiresIn` is not given: 86400 seconds.            |
| `resolveBifrost`      | function | Sign a token and return the `username`, `uuid` and `token` for `runClient`. |

## @opys/dgpuj

The dgpuj launcher. It forces the discrete GPU on hybrid-graphics systems and
runs the JVM in-process. [Plugin page](/plugins/dgpuj).

```sh
npm install @opys/dgpuj
```

| Export              | Kind     | Meaning                                                                           |
| ------------------- | -------- | --------------------------------------------------------------------------------- |
| `DgpujPlatform`     | type     | One published target: OS, arch, Rust target triple, archive type and binary name. |
| `DgpujReleaseAsset` | type     | A GitHub release asset, as the API spells it.                                     |
| `DgpujRelease`      | type     | A GitHub release of dgpuj.                                                        |
| `DgpujOptions`      | type     | The release, platforms, repository, token and API base.                           |
| `DgpujTemplate`     | type     | The per-target archives, the vars, and the release.                               |
| `DEFAULT_REPO`      | constant | The repository the releases come from.                                            |
| `DEFAULT_PLATFORMS` | constant | dgpuj's published targets. Not re-exported by `@opys/minecraft`.                  |
| `resolveDgpuj`      | function | Resolve a release into artifacts and vars.                                        |
| `dgpuj`             | function | The plugin. It exposes `bin` and `home` launch groups.                            |

## @opys/minecraft-serverlist

The multiplayer server list, written at build time as a `servers.dat` blob.
Entries with rules are split into one file per ruleset, all at the same path, so
when there is more than one ruleset only the last file survives the merge.
[Plugin page](/plugins/serverlist).

```sh
npm install @opys/minecraft-serverlist
```

| Export              | Kind     | Meaning                                                    |
| ------------------- | -------- | ---------------------------------------------------------- |
| `ServerEntry`       | type     | A server: `name`, `ip`, and optional `rules` that gate it. |
| `ServerlistOptions` | type     | The path the list is written to.                           |
| `DEFAULT_PATH`      | constant | The default path of the list.                              |
| `serverlist`        | function | The plugin.                                                |

## @opys/minecraft

A meta-package. It re-exports the surfaces of the Minecraft-domain packages, so a
config can import from one place. Its exports come from the packages named below,
unchanged. [Plugin page](/plugins/minecraft).

```sh
npm install -D @opys/minecraft
```

It re-exports every export of these packages with `export *`:
[`@opys/minecraft-vanilla`](#opys-minecraft-vanilla),
[`@opys/forge`](#opys-forge), [`@opys/neoforge`](#opys-neoforge),
[`@opys/fabric`](#opys-fabric), [`@opys/cleanroom`](#opys-cleanroom),
[`@opys/lwjgl3ify`](#opys-lwjgl3ify),
[`@opys/authliberty`](#opys-authliberty),
[`@opys/curseforge`](#opys-curseforge), [`@opys/modrinth`](#opys-modrinth),
[`@opys/link`](#opys-link),
[`@opys/minecraft-serverlist`](#opys-minecraft-serverlist) and
[`@opys/java`](#opys-java).

`@opys/dgpuj` and `@opys/bifrost` are re-exported by name, and a name that two
packages share is exported once:

- **dgpuj.** `dgpuj`, `resolveDgpuj`, `DEFAULT_REPO` and the types
  `DgpujOptions`, `DgpujPlatform` and `DgpujTemplate` come from `@opys/dgpuj`.
  Its `DEFAULT_PLATFORMS` is left out, because `@opys/java` exports a name of the
  same spelling. Import it from `@opys/dgpuj` if you need it.
- **bifrost.** `resolveBifrost` from `@opys/bifrost` is re-exported twice: as
  `resolveBifrost`, and as `bifrost`. `bifrost` is not a plugin; it is the same
  function under a name that sits beside the plugin factories.
- **LoaderSpec.** It is exported once, from `@opys/modrinth`. `@opys/curseforge`
  also exports a `LoaderSpec`, and the two are the same type.

Nothing else from `@opys/dgpuj` or `@opys/bifrost` is exported here: not
`DgpujRelease`, `DgpujReleaseAsset`, `DEFAULT_PLATFORMS` or
`DEFAULT_TTL_SECONDS`. `@opys/core`, `@opys/dev`, `@opys/runtime` and
`@opys/mojang` are not re-exported at all. The names exported by hand are:

| Export                                           | Kind     | Meaning                               |
| ------------------------------------------------ | -------- | ------------------------------------- |
| `dgpuj`                                          | function | The dgpuj plugin. From `@opys/dgpuj`. |
| `resolveDgpuj`                                   | function | From `@opys/dgpuj`.                   |
| `DEFAULT_REPO`                                   | constant | From `@opys/dgpuj`.                   |
| `DgpujOptions`, `DgpujPlatform`, `DgpujTemplate` | type     | From `@opys/dgpuj`.                   |
| `bifrost`                                        | function | An alias of `resolveBifrost`.         |
| `resolveBifrost`                                 | function | From `@opys/bifrost`.                 |
| `BifrostOptions`, `BifrostAuth`                  | type     | From `@opys/bifrost`.                 |
| `LoaderSpec`                                     | type     | From `@opys/modrinth`.                |

## opys (`@opys/cli`)

The `opys` command. The package exports nothing for code to import. It is
installed globally. [The opys command](/guide/cli).

```sh
npm install -g @opys/cli
```
