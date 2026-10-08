# neoforge

`neoforge()` adds a NeoForge build to your installation: the game, its
libraries and assets, and NeoForge's own libraries and launch arguments. It
takes any build the index publishes, for every Minecraft version it lists from
1.20.2 on, through one code path. You name a Minecraft version or a NeoForge
build id, and the plugin works out the rest. Use it in place of `minecraft()`,
since `neoforge()` already contributes the vanilla game it builds on, and pair
it with a [Java runtime](./java). This page is for pack authors.

## Signature

```ts
neoforge(version: string, opts?: {
  source?: string;
  manifestBase?: string;
}): ChainablePlugin
```

`version` is the only required argument. Calling `neoforge()` does no network
work; the lookups happen when `opys build` or `opys launch` builds the config.
It is exported from `@opys/minecraft` and from `@opys/neoforge`.

## Version

`version` takes one of three forms. The plugin tries them in this order.

| Form                         | Example                                              | Resolves to                             |
| ---------------------------- | ---------------------------------------------------- | --------------------------------------- |
| Alias on a Minecraft version | `1.21.1-latest`, `1.21.1-recommended`, `1.21.1-best` | That promotion of the Minecraft version |
| Minecraft version            | `1.21.1`                                             | Its `best` build                        |
| Build id                     | `21.1.172`                                           | That exact build                        |

NeoForge has no promotions endpoint, so the index says what each alias means.
`latest` is the newest build. `recommended` is the newest build whose version
carries no qualifier, such as `-beta`. `best` is `recommended` when there is
one, and `latest` otherwise. A bare Minecraft version means `best`. Many
Minecraft versions have no `recommended` build, and for those `best` is
`latest`.

A bare Minecraft version or an alias follows the index, so it can resolve to a
newer build later. Name a build id to pin one.

The index lists Minecraft versions from 1.20.2 on, with some snapshot keys
such as `25w14craftmine` and `26.1-snapshot-1`. `1.20.1` is not among them, so
`neoforge('1.20.1')` fails with
`Could not resolve NeoForge version '1.20.1' from <source>`.

If the version cannot be resolved, the build stops with one of these messages:

| Message                                                      | Cause                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `Unknown Minecraft version '<mc>' (resolving '<input>')`     | An alias on a Minecraft version the index does not list                  |
| `No '<alias>' NeoForge build available for Minecraft <mc>`   | The Minecraft version has no build for that alias, such as `recommended` |
| `Could not resolve NeoForge version '<input>' from <source>` | Neither a Minecraft version nor a build id the index lists               |

### A build id does not tell you its Minecraft version

Do not work out a Minecraft version from a NeoForge build id, and do not
expect one from it. `21.1.172` belongs to Minecraft 1.21.1, and for years every
NeoForge build did. `26.2.0.84` has four components and belongs to Minecraft
`26.2`, which has no leading `1.` at all. Mojang's version numbers changed
shape, and NeoForge's build ids followed.

So the plugin never parses a build id. It searches the whole index for it, and
you can pass the id on its own:

```js
neoforge('26.2.0.84'); // found under 26.2, no Minecraft version needed
```

## Options

| Option         | Type     | Default                                             | Meaning                                                                                                                    |
| -------------- | -------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `source`       | `string` | `https://harmoniya-net.github.io/metadata/neoforge` | Base URL of the document index. Set it for a mirror.                                                                       |
| `manifestBase` | `string` | Mojang's `version_manifest_v2.json`                 | URL of the Mojang version manifest, used to fetch the vanilla version a NeoForge build inherits from. Set it for a mirror. |

```js
neoforge('1.21.1', { source: 'https://mirror.example.com/metadata/neoforge' });
```

## Launch groups

The plugin is named `neoforge`, so its groups are read as `neoforge.<group>` in
`manifest.command` and `manifest.args`.

| Group                | Type     | Contains                                                                                                                        |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `neoforge.command`   | string   | `${java_bin}`, the Java binary the [`java`](./java) plugin provides. The examples use `java.bin` for `manifest.command` instead |
| `neoforge.jvmArgs`   | `Valset` | The JVM arguments for this build, including the classpath and the `-Dhorno.*` properties                                        |
| `neoforge.mainClass` | `Val`    | `net.harmoniya.horno.Main`, for every NeoForge build                                                                            |
| `neoforge.gameArgs`  | `Valset` | The game arguments for this build                                                                                               |

Put them in `manifest.args` in the order the game needs them:

```js
manifest: {
  command: ({ java }) => java.bin,
  args: ({ neoforge }) => [
    neoforge.jvmArgs,
    neoforge.mainClass,
    neoforge.gameArgs,
  ],
  workdir: '${game_directory}',
},
```

## Variables

`neoforge()` defines the same variables as [`minecraft`](./minecraft#variables),
with one change: `classpath` is built for this NeoForge build. It holds the
build's libraries, then the vanilla libraries the build does not replace. The
build lists the vanilla client jar as a library itself, so that entry stands in
for the client jar that `minecraft` puts last. `version_name` and
`version_type` are the vanilla version's.

`root` is `.` until the launching machine sets it. `username`, `uuid` and
`token` are not defined at all, so the launching machine must supply them. The
[launch-time values](/guide/run-client) page says how. `neoforge()` does not
define `java_bin`, `java_home` or `java_runtime_dir`. The [`java`](./java)
plugin does.

## Which Java

Pick the Java version by the Minecraft version. opys does not check the
pairing, so a mismatch fails when the game starts, not when you build.

| Minecraft version | Java |
| ----------------- | ---- |
| 1.20.2 to 1.20.4  | `17` |
| 1.20.5 to 1.21.x  | `21` |
| 26.x              | `25` |

```js
plugins: [neoforge('1.21.1'), java('21')],
```

## How it works

Every NeoForge build is published as a version document at
`harmoniya-net.github.io/metadata/neoforge`. The index lists each Minecraft
version and its builds, and each build has a document in the same shape as a
[Forge](./forge) one. When you name a version, the plugin reads the index,
reads the document, fetches the vanilla version the document inherits from,
and folds the two together. The NeoForge libraries go ahead of the vanilla
ones, and a vanilla library that a NeoForge library replaces is dropped from
the classpath and from the downloads.

NeoForge has one way of installing. Its installer runs processors that patch
the client, and those have to run on the launching machine. Every build
therefore launches through [horno](/internals/horno). The document declares
horno as a library and names it as the main class, and the `-Dhorno.*`
arguments name the NeoForge installer on NeoForge's maven, its URL and its
SHA-1. Horno runs the installer's processors before the game starts. The
[metadata](/internals/metadata) page describes the documents and how they are
generated.

::: tip
You do not configure any of this. The plugin writes the document's arguments
into the manifest, and the launcher does the rest.
:::

## Example

<<< @/examples/plugin-neoforge-basic/opys.config.mjs

Run `opys build` to write `game.opys`, or `opys launch` to start the game from
the config. Mods go alongside the loader. See [Mods and files](/guide/mods).
