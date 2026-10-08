# @opys/mojang

`@opys/mojang` parses the formats Mojang publishes: the version manifest, a
version JSON, libraries, arguments and asset indexes. It also holds the strict
Mojang rule evaluator. Use it when you read those documents yourself. This page
lists every export. The package does no I/O: you fetch the documents, and it
parses them.

```ts
import {
  parseVersionManifest,
  findVersion,
  latestRelease,
  parseClient,
  parseAssetManifest,
  satisfiesRuleset,
} from '@opys/mojang';
```

The rule functions take Mojang's own form only. The opys shorthand, such as
`'allow.os.linux'`, is spelled in [`@opys/core`](/plugins/core) and is rejected
here. The rule types are described in [`@opys/mojang-rules`](/plugins/mojang-rules).

## Version manifest

### `parseVersionManifest`

```ts
function parseVersionManifest(raw: unknown): VersionManifest;
```

Parses `version_manifest_v2.json`.

### `findVersion`

```ts
function findVersion(
  manifest: VersionManifest,
  id: string,
): Version | undefined;
```

Returns the entry with that `id`, or `undefined` when there is none.

### `latestRelease`

```ts
function latestRelease(manifest: VersionManifest): Version;
```

Returns the entry that `latest.release` names. Throws when the manifest's
`versions` does not list it.

### `VERSION_MANIFEST_URL`

```ts
const VERSION_MANIFEST_URL: string;
```

The address of the version manifest,
`https://launchermeta.mojang.com/mc/game/version_manifest_v2.json`.

## Version JSON

### `parseClient`

```ts
function parseClient(raw: unknown): Client;
```

Parses a version JSON into a `Client`: its id, Java version, asset index,
downloads, main class, libraries, arguments, release metadata and logging
configuration. A version JSON gives its arguments as `arguments` or as the
legacy `minecraftArguments`; when it has both, `arguments` is used, and when it
has neither the parse throws. A version with no `javaVersion` gets
`{ component: 'jre-legacy', majorVersion: 8 }`.

### `parseLibraries`

```ts
function parseLibraries(raws: unknown[]): Library[];
```

Parses the `libraries` array of a version JSON on its own. The result is
flat: one entry in the JSON becomes a `Library` for its main artifact, if it
has one, and one more for each native classifier it lists, each of those with
a rule for its OS and `native` set. Every entry needs a `downloads` object.

### `parseArguments`

```ts
function parseArguments(raw: unknown): Arguments;
```

Parses a version JSON's `arguments` object, or a legacy `minecraftArguments`
string. For the string, the game arguments are its words, the JVM arguments are
`LEGACY_JVM_ARGS`, and `Arguments.legacy` is `true`.

### `mergeArgs`

```ts
function mergeArgs(base: Arguments, patch: Arguments): Arguments;
```

Merges a patch version's arguments onto a base version's, as `inheritsFrom`
does: the patch's `jvm` and `game` arguments come after the base's. A legacy
patch has no structured arguments to append, so the base comes back unchanged.

### `LEGACY_JVM_ARGS`

```ts
const LEGACY_JVM_ARGS: MojangArgValue[];
```

The JVM arguments that a legacy `minecraftArguments` version implies:
`-Djava.library.path=${natives_directory}`, `-cp` and `${classpath}`.

## Asset index

### `parseAssetManifest`

```ts
function parseAssetManifest(raw: unknown): AssetManifest;
```

Parses an asset index. `objects` maps each asset's name to its `hash` and
`size`. `virtual` is `true` for the `legacy` index (Minecraft 1.6 to 1.7.2) and
`map_to_resources` for the `pre-1.6` index. Both are absent otherwise.

### `assetUrl`

```ts
function assetUrl(hash: string): string;
```

The download address of the asset object with that hash:
`https://resources.download.minecraft.net/<first two characters>/<hash>`.

### `assetPath`

```ts
function assetPath(hash: string): string;
```

The path of the asset object with that hash, relative to the objects
directory: `<first two characters>/<hash>`.

## Maven coordinates

### `parseMaven`

```ts
function parseMaven(value: string): MavenCoord;
```

Parses a Maven coordinate of two to five colon-separated segments. Two segments
are `group:artifact`. Three add the version, `group:artifact:version`. Four
add a classifier after it, `group:artifact:version:classifier`. Five are
`group:artifact:packaging:classifier:version`. Throws on any other count.

### `encodeMaven`

```ts
function encodeMaven(c: MavenCoord): string;
```

Writes a `MavenCoord` back as a coordinate string. A tail it cannot write in
full is dropped: a classifier with no version comes back as `group:artifact`.

### `isNativeMaven`

```ts
function isNativeMaven(c: MavenCoord): boolean;
```

`true` when the coordinate's classifier starts with `natives`, such as
`natives-linux`.

### `mavenMatchesIgnoringVersion`

```ts
function mavenMatchesIgnoringVersion(a: MavenCoord, b: MavenCoord): boolean;
```

`true` when the two coordinates agree on every field except `version`.

## Rules

These functions take Mojang's form. For the shape of a rule and how a ruleset
is evaluated, see [`@opys/mojang-rules`](/plugins/mojang-rules).

### `decodeRuleset`

```ts
function decodeRuleset(raw: unknown): MojangRuleset;
```

Decodes a ruleset from its JSON, which is an array of rules. Throws on the
shorthand, such as `'allow.os.linux'`. It does not throw on a rule it cannot
read as written, such as an unknown OS name; see
[Reading a rule](/plugins/mojang-rules#reading-a-rule).

### `encodeRuleset`

```ts
function encodeRuleset(ruleset: MojangRuleset): unknown;
```

Encodes a ruleset as the JSON a version document holds. It writes the expanded
form and never the shorthand.

### `satisfiesRuleset`

```ts
function satisfiesRuleset(
  rules: MojangRuleset,
  platform: OsOptions,
  features?: string[],
): boolean;
```

`true` when every rule in the ruleset is satisfied. An empty ruleset is
satisfied. Throws when it reaches a rule whose OS version pattern is not a
valid regular expression.

### `satisfiesRule`

```ts
function satisfiesRule(
  rule: MojangRule,
  platform: OsOptions,
  features?: string[],
): boolean;
```

Evaluates one rule. `features` is read only by a rule with a `features`
constraint.

### `satisfiesOs`

```ts
function satisfiesOs(constraint: OsConstraint, platform: OsOptions): boolean;
```

`true` when every field the constraint sets matches the platform. `name` and
`arch` must equal the platform's. The constraint's `version` is a regular
expression, matched anywhere in the platform's version.

### `satisfiesFeatures`

```ts
function satisfiesFeatures(
  constraint: FeatureConstraint,
  features?: string[],
): boolean;
```

`true` when each feature in the constraint is present or absent, as its value
says.

## Types

Re-exported from [`@opys/mojang-rules`](/plugins/mojang-rules):
`OsName`, `OsArch`, `OsOptions`, `OsConstraint`, `FeatureConstraint`,
`RuleAction`, `MojangRule`, `MojangRuleset`. Also `emptyRuleset` and
`allowOsRuleset`, which are the same functions as in that package.

Parsed from Mojang's documents:

| Type              | Shape                                                                                             | What it is                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `MavenCoord`      | `groupId`, `artifactId`, `version?`, `classifier?`, `packaging?`                                  | A Maven coordinate.                                                                   |
| `Artifact`        | `path`, `sha1`, `size`, `url`                                                                     | A file a library names.                                                               |
| `Library`         | `name`, `rules`, `artifact`, `native`                                                             | One file of a version's `libraries`, after the flattening `parseLibraries` describes. |
| `MojangArgValue`  | `string \| { rules, value: string \| string[] }`                                                  | One argument, or one that applies only when its rules hold.                           |
| `Arguments`       | `game`, `jvm`, `legacy`                                                                           | A version's game and JVM arguments.                                                   |
| `JavaVersion`     | `component`, `majorVersion`                                                                       | The Java runtime a version asks for.                                                  |
| `AssetObject`     | `hash`, `size`                                                                                    | One entry of an asset index's `objects`.                                              |
| `AssetManifest`   | `objects`, `virtual?`, `map_to_resources?`                                                        | An asset index. The two flags mark the legacy layouts.                                |
| `AssetIndex`      | `id`, `sha1`, `size`, `totalSize`, `url`                                                          | The reference to a version's asset index.                                             |
| `DownloadsFile`   | `sha1`, `size`, `url`                                                                             | One file a version's `downloads` names.                                               |
| `Downloads`       | `client`, `clientMappings?`, `server?`, `windowsServer?`, `serverMappings?`                       | The files a version downloads.                                                        |
| `LoggingFile`     | `id`, `sha1`, `size`, `url`                                                                       | The log configuration file.                                                           |
| `LoggingClient`   | `argument`, `file`, `type`                                                                        | The client's logging setup.                                                           |
| `Logging`         | `client`                                                                                          | The logging block of a version.                                                       |
| `ClientMetadata`  | `type`, `time`, `releaseTime`, `minimumLauncherVersion`, `assets`, `complianceLevel`              | Release details of a version.                                                         |
| `Client`          | `id`, `java`, `assetIndex`, `downloads`, `mainClass`, `libraries`, `args`, `metadata`, `logging?` | A parsed version JSON.                                                                |
| `Version`         | `id`, `type`, `url`, `time`, `releaseTime`, `sha1`, `complianceLevel`                             | One entry of the version manifest.                                                    |
| `VersionManifest` | `latest: { release, snapshot }`, `versions`                                                       | The version manifest.                                                                 |

::: warning Parsers and HTTP
The parsers do not fetch. To download a version JSON or an asset index, use
the fetch functions in [`@opys/minecraft-vanilla`](/plugins/minecraft-vanilla):
`fetchVersionManifest`, `fetchAssetManifest` and `fetchClient`.
:::
