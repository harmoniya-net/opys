# forge

`forge()` adds a Forge build to your installation: the game, its libraries and
assets, and Forge's own libraries and launch arguments. It takes any build the
index publishes, for every Minecraft version it lists from 1.1 on, through one
code path. You name a Minecraft version or a Forge build, and the plugin works
out the rest. Use it in place of `minecraft()`, since `forge()` already
contributes the vanilla game it builds on, and pair it with a
[Java runtime](./java). This page is for pack authors.

## Signature

```ts
forge(version: string, opts?: {
  source?: string;
  manifestBase?: string;
}): ChainablePlugin
```

`version` is the only required argument. Calling `forge()` does no network
work; the lookups happen when `opys build` or `opys launch` builds the config.
It is exported from `@opys/minecraft` and from `@opys/forge`.

## Version

`version` takes one of three forms. The plugin tries them in this order.

| Form                         | Example                                              | Resolves to                             |
| ---------------------------- | ---------------------------------------------------- | --------------------------------------- |
| Alias on a Minecraft version | `1.20.1-latest`, `1.20.1-recommended`, `1.20.1-best` | That promotion of the Minecraft version |
| Minecraft version            | `1.20.1`                                             | Its `best` build                        |
| Build id                     | `1.20.1-47.4.10`                                     | That exact build                        |

`latest` and `recommended` are Forge's own promotions. `best` is `recommended`
when the Minecraft version has one, and `latest` otherwise. A bare Minecraft
version means `best`, so `forge('1.20.1')` and `forge('1.20.1-best')` are the
same build. Many Minecraft versions have no `recommended` build, and for those
`best` is `latest`.

A bare Minecraft version or an alias follows the index, so it can resolve to a
newer build later. Name a build id to pin one.

A build id is looked up in the index, not parsed. Forge's ids do not all share
one shape: 1.7.10 builds repeat the version at both ends, as in
`1.7.10-10.13.4.1614-1.7.10`. Use the id as Forge lists it.

If the version cannot be resolved, the build stops with one of these messages:

| Message                                                   | Cause                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `Unknown Minecraft version '<mc>' (resolving '<input>')`  | An alias on a Minecraft version the index does not list                  |
| `No '<alias>' Forge build available for Minecraft <mc>`   | The Minecraft version has no build for that alias, such as `recommended` |
| `Could not resolve Forge version '<input>' from <source>` | Neither a Minecraft version nor a build id the index lists               |

## Options

| Option         | Type     | Default                                          | Meaning                                                                                                                 |
| -------------- | -------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `source`       | `string` | `https://harmoniya-net.github.io/metadata/forge` | Base URL of the document index. Set it for a mirror.                                                                    |
| `manifestBase` | `string` | Mojang's `version_manifest_v2.json`              | URL of the Mojang version manifest, used to fetch the vanilla version a Forge build inherits from. Set it for a mirror. |

```js
forge('1.20.1', { source: 'https://mirror.example.com/metadata/forge' });
```

## Launch groups

The plugin is named `forge`, so its groups are read as `forge.<group>` in
`manifest.command` and `manifest.args`.

| Group             | Type     | Contains                                                                                                                        |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `forge.command`   | string   | `${java_bin}`, the Java binary the [`java`](./java) plugin provides. The examples use `java.bin` for `manifest.command` instead |
| `forge.jvmArgs`   | `Valset` | The JVM arguments for this build, including the classpath and, for builds that use horno, the `-Dhorno.*` properties            |
| `forge.mainClass` | `Val`    | The class to start. See below                                                                                                   |
| `forge.gameArgs`  | `Valset` | The game arguments for this build                                                                                               |

The main class depends on the build. Builds that run through horno start
`net.harmoniya.horno.Main`, which then installs Forge and starts the game.
Builds for Minecraft 1.6.2 to 1.12.2 start LaunchWrapper's
`net.minecraft.launchwrapper.Launch` directly. Your config does not need to
know which: `forge.mainClass` carries the right one. Put the groups in
`manifest.args` in the order the game needs them:

```js
manifest: {
  command: ({ java }) => java.bin,
  args: ({ forge }) => [forge.jvmArgs, forge.mainClass, forge.gameArgs],
  workdir: '${game_directory}',
},
```

## Variables

`forge()` defines the same variables as [`minecraft`](./minecraft#variables),
with one change: `classpath` is built for this Forge build. It holds the
build's libraries, then the vanilla libraries the build does not replace. The
vanilla client jar comes last, unless the build lists the client jar itself as
a library, as every build that goes through horno does. `version_name` and
`version_type` are the vanilla version's.

`root` is `.` until the launching machine sets it. `username`, `uuid` and
`token` are not defined at all, so the launching machine must supply them. The
[launch-time values](/guide/run-client) page says how. `forge()` does not
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

Two builds need a version outside that table:

- **1.7.2** predates Java 8 and does not start on it. Use Java 7 from Zulu:
  `java('7', { vendor: 'zulu' })`. Zulu publishes Java 7 for `x86_64` only.
- **1.16.4** reads a JDK internal that Java 8u321 changed. Use a Java 8 release
  from before that update, such as `java('8u312-b07')`. The default vendor,
  Temurin, provides it.

```js
plugins: [forge('1.7.2'), java('7', { vendor: 'zulu' })],
```

## How it works

Every Forge build is published as a version document at
`harmoniya-net.github.io/metadata/forge`. The index there lists each Minecraft
version and its builds, and each build has a document that says how to start
it, in the shape of a Mojang version JSON that inherits from a vanilla version.
When you name a version, the plugin reads the index, reads the document,
fetches the vanilla version the document inherits from, and folds the two
together. The Forge libraries go ahead of the vanilla ones, and a vanilla
library that a Forge library replaces is dropped from the classpath and from
the downloads. The client jar goes last, except where the document lists it
itself: then that entry stands in for it, and `${version_dir}/client.jar` is
neither downloaded nor on the classpath.

Forge installs in more than one way. Builds from 1.13.2 on need Forge's
processors run, and the 1.1 to 1.5.2 jar mods need the client jar rewritten.
Both happen on the launching machine, in [horno](/internals/horno), before the
game starts. The document declares horno as a library and names it as the main
class. For a processor build the `-Dhorno.*` arguments name Forge's installer,
its URL and its SHA-1, and horno runs the installer's processors. For a jar-mod
build they name the patched client jar to produce and the class to start
afterwards. Builds for 1.6.2 to 1.12.2 need no horno and start LaunchWrapper
directly. The [metadata](/internals/metadata) page describes the documents and
how they are generated.

::: tip
You do not configure any of this. The plugin writes the document's arguments
into the manifest, and the launcher does the rest.
:::

## Example

<<< @/examples/plugin-forge-basic/opys.config.mjs

Run `opys build` to write `game.opys`, or `opys launch` to start the game from
the config. Mods go alongside the loader. See [Mods and files](/guide/mods).
