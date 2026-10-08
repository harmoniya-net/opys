# fabric

`fabric()` adds the Fabric mod loader to your installation: the game, its
libraries and assets, and Fabric's own libraries and launch arguments. You name
a Minecraft version, and the plugin picks a Fabric loader build for it, reads
Fabric's launcher profile, and folds that profile onto the vanilla version it
inherits from. Use it in place of `minecraft()`, since `fabric()` already
contributes the vanilla game it builds on, and pair it with a
[Java runtime](./java). This page is for pack authors. For how loaders fit
into a config, see [Loaders](/guide/loaders).

## Signature

```ts
fabric(version: string, opts?: {
  loader?: string;
  source?: string;
  manifestBase?: string;
}): ChainablePlugin
```

`version` is the only required argument. Calling `fabric()` does no network
work; the lookups happen when `opys build` or `opys launch` builds the config.
It is exported from `@opys/minecraft` and from `@opys/fabric`.

## Version

`version` is the **Minecraft** version, such as `'1.21.4'`. A Fabric loader
build does not depend on the game version, so the loader is chosen with the
`loader` option and not by putting it in `version`. There are no aliases and no
build ids: `'1.21.4-best'` is not a version string for Fabric.

Without a `loader`, the plugin asks Fabric Meta for the loader builds that
target `version` and takes the newest stable one. If none is stable, it takes
the newest build of any stability. A Minecraft version Meta does not know
fails the build with Meta's `HTTP 400`.

## Options

| Option         | Type     | Default                                      | Meaning                                                                                                                      |
| -------------- | -------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `loader`       | `string` | The newest stable loader build for `version` | A loader build, such as `'0.16.10'`. A pinned loader skips the lookup of the newest build.                                   |
| `source`       | `string` | `https://meta.fabricmc.net`                  | Base URL of the Fabric Meta API. Set it for a mirror.                                                                        |
| `manifestBase` | `string` | Mojang's `version_manifest_v2.json`          | URL of the Mojang version manifest, used to fetch the vanilla version the Fabric profile inherits from. Set it for a mirror. |

Pin the loader when you want a build that does not change between builds:

```js
fabric('1.21.4', { loader: '0.16.10' });
```

The pinned build must exist for that Minecraft version. The build still
downloads the profile and the vanilla version.

## Launch groups

The plugin is named `fabric`, so its groups are read as `fabric.<group>` in
`manifest.command` and `manifest.args`.

| Group              | Type     | Contains                                                                                                                        |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `fabric.command`   | string   | `${java_bin}`, the Java binary the [`java`](./java) plugin provides. The examples use `java.bin` for `manifest.command` instead |
| `fabric.jvmArgs`   | `Valset` | The JVM arguments: vanilla's, with the profile's merged in                                                                      |
| `fabric.mainClass` | `Val`    | The main class from the Fabric profile, which replaces vanilla's                                                                |
| `fabric.gameArgs`  | `Valset` | The game arguments: vanilla's, with the profile's merged in                                                                     |

Put them in `manifest.args` in the order the game needs them:

```js
manifest: {
  command: ({ java }) => java.bin,
  args: ({ fabric }) => [fabric.jvmArgs, fabric.mainClass, fabric.gameArgs],
  workdir: '${game_directory}',
},
```

## Variables

`fabric()` defines the same variables as [`minecraft`](./minecraft#variables),
with one change: `classpath` is built for this Fabric build. It holds Fabric's
libraries, then the vanilla libraries Fabric does not replace, then the client
jar. `version_name` and `version_type` are the vanilla version's.

`root` is `.` until the launching machine sets it. `username`, `uuid` and
`token` are not defined at all, so the launching machine must supply them. The
[launch-time values](/guide/run-client) page says how. `fabric()` does not
define `java_bin`, `java_home` or `java_runtime_dir`. The [`java`](./java)
plugin does.

## Which Java

Pick the Java version by the Minecraft version. opys does not check the
pairing, so a mismatch fails when the game starts, not when you build.

| Minecraft version  | Java |
| ------------------ | ---- |
| 1.16.5 and earlier | `8`  |
| 1.17 to 1.20.4     | `17` |
| 1.20.5 to 1.21.x   | `21` |
| 26.x               | `25` |

```js
plugins: [fabric('1.21.4'), java('21')],
```

## How it works

`fabric()` asks Fabric Meta for the newest stable loader build for the
Minecraft version, which it skips when you pin `loader`, and downloads that
build's launcher profile. The profile names the vanilla version it inherits
from. opys looks that version up in the Mojang version manifest, downloads its
version JSON and asset index, and maps it with the same code the `minecraft`
plugin uses.

The profile is then folded onto the vanilla version. Its libraries go ahead of
vanilla's on the classpath, so Fabric's copy of a library is the one the game
loads. A vanilla library that a Fabric library supersedes (the same group and
artifact) is dropped from the classpath and from the downloads. The profile's
arguments are merged onto vanilla's, and its main class replaces vanilla's.
Fabric's libraries come from the Maven repository the profile names, and each
is pinned by the sha1 and size the profile gives; a library with no sha1 is
downloaded without a hash to check.

Fabric needs nothing run on the launching machine before the game starts.

## Example

<<< @/examples/plugin-fabric-basic/opys.config.mjs

Run `opys build` to write `game.opys`, or `opys launch` to start the game from
the config. Mods go alongside the loader. See [Mods and files](/guide/mods).
