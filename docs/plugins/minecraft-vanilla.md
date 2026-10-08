# @opys/minecraft-vanilla

`@opys/minecraft-vanilla` is the package behind the [`minecraft`](./minecraft)
plugin. Besides the plugin it exports the functions that turn a Mojang version
JSON into manifest artifacts, variables and launch groups. Every loader in the
family, such as `forge`, `fabric` or `neoforge`, resolves its own version JSON
and then runs it through the same mappers, so the classpath, the natives and
the assets are mapped in one place. This page is for someone writing a loader
plugin. If you only build packs, the [`minecraft`](./minecraft) page is the one
you need.

```sh
npm install @opys/minecraft-vanilla
```

## What it contributes

Given a version JSON, the mappers produce:

- **The client jar.** One artifact at `${version_dir}/client.jar`, pinned by
  the sha1 and size in the version JSON.
- **Libraries.** One artifact per library at `${library_directory}/<maven
path>`, with the library's rules. A library without a sha1 is downloaded
  without one to check against.
- **Natives.** A native library is extracted into `${natives_directory}` when
  it is installed, with the `clean` flag set and `META-INF/` excluded.
- **Assets.** The asset index as `${assets_root}/indexes/<id>.json`, and one
  artifact per asset object, pinned by its sha1. Three layouts exist and the
  asset index says which applies. See [asset layouts](/reference/asset-layouts).
- **The classpath.** One `${classpath}` value per operating system. Every
  library the OS's rules allow comes first, in the order given, and the client
  jar comes last.
- **The launch.** The command, JVM arguments, main class and game arguments,
  as a `Launch` and as the separate parts.

The variables are the ones the [`minecraft`](./minecraft#variables) page lists,
and the launch groups are the ones in its
[launch groups](./minecraft#launch-groups).

## Signature

The plugin takes the same arguments as on the
[`minecraft`](./minecraft#signature) page:
`minecraft(version?, { manifestBase? })`. Its
[version](./minecraft#version) rules are the same too.

## Exports

Each function below is a call into native code. Those marked _network_ make
requests; those marked _pure_ do no I/O. The `Client`, `Library`, `AssetIndex`,
`AssetManifest`, `Version`, `VersionManifest` and `MojangArgValue` types come
from [`@opys/mojang`](./mojang), and `Artifact`, `ConditionalVal`, `Launch`,
`Val`, `Valset` and `ValDefs` from [`@opys/core`](./core).

### Fetching

| Function                            | Returns                      | Meaning                                                                                                                                                                                     |
| ----------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveMinecraft(options?)`        | `Promise<MinecraftTemplate>` | _Network._ Looks the version up in the version manifest, fetches its version JSON and asset index, then maps them. What the plugin calls.                                                   |
| `fetchClient(versionId?, options?)` | `Promise<FetchedClient>`     | _Network._ Looks the id up in the version manifest and fetches its version JSON. Returns `{ version, client }`. Omitting the id takes the latest release. `options` is `{ manifestBase? }`. |
| `clientToTemplate(client)`          | `Promise<MinecraftTemplate>` | _Network._ Maps a `Client` you already hold. Only its asset index is fetched.                                                                                                               |
| `fetchVersionManifest(url?)`        | `Promise<VersionManifest>`   | _Network._ Fetches `version_manifest_v2.json`, or the URL you give.                                                                                                                         |
| `fetchAssetManifest(url)`           | `Promise<AssetManifest>`     | _Network._ Fetches and parses an asset index document, the list of asset objects.                                                                                                           |
| `VERSION_MANIFEST_URL`              | `string`                     | Mojang's version manifest URL.                                                                                                                                                              |

`clientToTemplate` is the entry point for a loader. A loader gets a `Client`
its own way, from an installer, a launcher profile or a release, and hands it
here.

### Mappers

| Function                                    | Returns             | Meaning                                                                                                                    |
| ------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `mapClientToTemplate(client, assets)`       | `MinecraftTemplate` | _Pure._ The client and its asset index document, mapped. The pure half of `clientToTemplate`.                              |
| `mapClientJar(client)`                      | `Artifact`          | _Pure._ The client jar at `${version_dir}/client.jar`.                                                                     |
| `libraryToArtifact(library)`                | `Artifact`          | _Pure._ One library. Natives get the extraction rule.                                                                      |
| `mapLibraries(libraries)`                   | `Artifact[]`        | _Pure._ `libraryToArtifact` over a list, in order.                                                                         |
| `mapAssetIndex(index)`                      | `Artifact`          | _Pure._ The artifact that downloads the asset index document, from the `AssetIndex` reference in the version JSON.         |
| `mapAssetObjects(manifest, indexId)`        | `Artifact[]`        | _Pure._ One artifact per asset object, placed where the game will look for it.                                             |
| `buildClasspath(entries, clientJarPath)`    | `ConditionalVal[]`  | _Pure._ The `${classpath}` arms, one per OS, with the client jar last.                                                     |
| `buildLaunch(mainClass, gameArgs, jvmArgs)` | `LaunchParts`       | _Pure._ The launch from a main class and two argument lists. The game arguments come before the JVM arguments in the call. |

`mapAssetObjects` reads the layout from the asset index document itself, which
says whether the game uses the hashed store or one of the two older layouts.
`indexId` names the directory for the `legacy` layout (see
[asset layouts](/reference/asset-layouts) for the three cases).

`buildClasspath` takes the entries in the order you want them on the
classpath. Each entry is `{ rules?, artifactPath }`. Put your own libraries
first and the client jar goes last without you adding it.

### Types

| Type                | Shape                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `MinecraftOptions`  | `{ version?, manifestBase? }`                                                              |
| `ClasspathEntry`    | `{ rules?: MojangRuleset, artifactPath: string }`                                          |
| `LaunchParts`       | `{ launch: Launch, jvmArgs: Valset, mainClass: Val, gameArgs: Valset }`                    |
| `MinecraftTemplate` | `LaunchParts` plus `{ artifacts: Artifact[], vars: ValDefs, classpath: ConditionalVal[] }` |
| `FetchedClient`     | `{ version: Version, client: Client }`                                                     |

`MinecraftTemplate.classpath` holds the same arms as `vars.classpath`. It is
there so a loader can see them without reading the variables.

::: warning Not in the package
The native code also folds a loader's `inheritsFrom` document onto the base
version. It drops any base library the document supersedes, including the
vanilla client jar when the document lists a `com.mojang:minecraft` library of
its own, as Forge's documents do. That fold is `patch_to_template` in Rust, and
no function here reaches it. A JavaScript loader has to do the dropping
itself, and `buildClasspath` always adds the client jar, so it cannot serve a
document that lists its own. See the example below.
:::

## How a loader uses them

A loader does four things: it resolves its version JSON, maps the base game,
adds its own libraries, and builds the launch. The mappers do the middle two.

Here is the shape, as a sketch. It is not a complete plugin, and it leaves out
the loader's own parsing.

```js
import {
  buildClasspath,
  buildLaunch,
  clientToTemplate,
  mapLibraries,
} from '@opys/minecraft-vanilla';

// `client` is a Client your loader resolved. `own` is the list of libraries
// its document adds, as Library values.
export async function build(client, own, mainClass, gameArgs, jvmArgs) {
  const vanilla = await clientToTemplate(client);

  const toEntry = (lib) => ({
    rules: lib.rules,
    artifactPath: `\${library_directory}/${lib.artifact.path}`,
  });

  // Drop any base library your document replaces, matching on group and
  // artifact. Natives are never matched: a pre-1.19 version JSON gives every
  // native of a library that library's own coordinate, so one replacement
  // would delete a whole per-OS set.
  const key = (lib) =>
    lib.native ? null : `${lib.name.groupId}:${lib.name.artifactId}`;
  const replaced = new Set(own.map(key));
  const base = client.libraries.filter(
    (lib) => key(lib) === null || !replaced.has(key(lib)),
  );

  const classpath = buildClasspath(
    [...own.map(toEntry), ...base.map(toEntry)],
    '${version_dir}/client.jar',
  );

  const parts = buildLaunch(mainClass, gameArgs, jvmArgs);

  return {
    artifacts: [...vanilla.artifacts, ...mapLibraries(own)],
    vars: { ...vanilla.vars, classpath },
    launch: {
      command: vanilla.launch.command,
      jvmArgs: parts.jvmArgs,
      mainClass: parts.mainClass,
      gameArgs: parts.gameArgs,
    },
  };
}
```

Three points about this.

- The `artifacts` list keeps the base libraries that the loader replaces. The
  classpath no longer names them, but they are still downloaded. Filter them
  out of `vanilla.artifacts` as well if that matters to your pack.
- `vars.classpath` is replaced, not extended. `ValDefs` takes a
  `ConditionalVal[]` in place of the string, so the spread above overrides the
  one from the base game.
- `mainClass`, `gameArgs` and `jvmArgs` are what your loader assembled from its
  document. `buildLaunch` only wraps them. Merging the base game's arguments
  with the loader's is your code.

For how loaders are structured on the build side, see
[writing a plugin](/reference/writing-a-plugin). For the variables the launch
expects, see the [`minecraft` page](./minecraft#variables).
