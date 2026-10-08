# cleanroom

`cleanroom()` adds [Cleanroom](https://github.com/CleanroomMC/Cleanroom) to
your installation: the game, its libraries and assets. Cleanroom is a successor
to Forge for Minecraft 1.12.2 that runs on a modern Java and uses LWJGL 3. Use
it to make a 1.12.2 pack that starts on Java 25. Use it in place of
`minecraft()`, since `cleanroom()` already contributes the vanilla game, and
pair it with a [Java runtime](./java). This page is for pack authors. For how
loaders fit into a config, see [Loaders](/guide/loaders).

## Signature

```ts
cleanroom(version: string, opts?: {
  source?: string;
}): ChainablePlugin
```

`version` is the only required argument. Calling `cleanroom()` does no network
work; the lookups happen when `opys build` or `opys launch` builds the config.
It is exported from `@opys/minecraft` and from `@opys/cleanroom`.

## Version

`version` takes one of three forms. The plugin tries them in this order.

| Form                         | Example                                              | Resolves to                                            |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| Alias on a Minecraft version | `1.12.2-latest`, `1.12.2-recommended`, `1.12.2-best` | That promotion of the Minecraft version                |
| Minecraft version            | `1.12.2`                                             | Its `best` release                                     |
| Release tag                  | `0.6.13-alpha`                                       | That exact release. Its Minecraft version is looked up |

Cleanroom has no promotions endpoint, so the index says what each alias means.
`latest` is the newest release. `recommended` is the newest release GitHub
does not mark as a prerelease. `best` is `recommended` when there is one, and
`latest` otherwise. A bare Minecraft version means `best`. The index has one
Minecraft version, `1.12.2`.

A bare Minecraft version or an alias follows the index, so it can resolve to a
newer release later. Name a release tag to pin one.

If the version cannot be resolved, the build stops with one of these messages:

| Message                                                       | Cause                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| `Unknown Minecraft version '<mc>' (resolving '<input>')`      | An alias on a Minecraft version the index does not list       |
| `No '<alias>' Cleanroom build available for Minecraft <mc>`   | The Minecraft version has no build for that alias             |
| `Could not resolve Cleanroom version '<input>' from <source>` | Neither a Minecraft version nor a release tag the index lists |

## Options

| Option   | Type     | Default                                              | Meaning                                              |
| -------- | -------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `source` | `string` | `https://harmoniya-net.github.io/metadata/cleanroom` | Base URL of the document index. Set it for a mirror. |

There is no `manifestBase`: Cleanroom's document is a whole version, so no
Mojang version manifest is read. There is no installer to configure and no
GitHub token either; Cleanroom resolves from the index alone.

## Launch groups

The plugin is named `cleanroom`, so its groups are read as `cleanroom.<group>`
in `manifest.command` and `manifest.args`.

| Group                 | Type     | Contains                                                                                                                                      |
| --------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `cleanroom.command`   | string   | `${java_bin}`, the Java binary the [`java`](./java) plugin provides. The examples use `java.bin` for `manifest.command` instead               |
| `cleanroom.jvmArgs`   | `Valset` | The JVM arguments for this release: `-Djava.library.path=${natives_directory}` and `-cp ${classpath}`, since the document has none of its own |
| `cleanroom.mainClass` | `Val`    | The main class from the document, `top.outlands.foundation.boot.Foundation`                                                                   |
| `cleanroom.gameArgs`  | `Valset` | The game arguments from the document                                                                                                          |

Put them in `manifest.args` in the order the game needs them:

```js
manifest: {
  command: ({ java }) => java.bin,
  args: ({ cleanroom }) => [
    cleanroom.jvmArgs,
    cleanroom.mainClass,
    cleanroom.gameArgs,
  ],
  workdir: '${game_directory}',
},
```

## Variables

`cleanroom()` defines the same variables as [`minecraft`](./minecraft#variables),
with two differences. `classpath` is built from the libraries of Cleanroom's
own document, and `version_name` and `version_type` come from that document
and not from a vanilla version: for `0.6.13-alpha`, `version_name` is
`1.12.2-Cleanroom-0.6.13-alpha`, and so `version_dir` is
`${root}/versions/1.12.2-Cleanroom-0.6.13-alpha`.

`root` is `.` until the launching machine sets it. `username`, `uuid` and
`token` are not defined at all, so the launching machine must supply them. The
[launch-time values](/guide/run-client) page says how. `cleanroom()` does not
define `java_bin`, `java_home` or `java_runtime_dir`. The [`java`](./java)
plugin does.

## Which Java

Use Java 25: `java('25')`. Running 1.12.2 on a current Java is what Cleanroom
is for, and the current release declares Java 25. opys does not check the
pairing, so a mismatch fails when the game starts, not when you build.

```js
plugins: [cleanroom('1.12.2'), java('25')],
```

Not every vendor ships Java 25 for every platform; see
[Platforms](./java#platforms).

## How it works

Cleanroom's installer does not run on your machine. Each Cleanroom release is
published ahead of time as one complete version document, so `cleanroom()`
makes three requests at build time: the index of releases, to find the one you
asked for, then that release's document, then the asset index the document
names. It does not fetch a vanilla version. The document already names the
1.12.2 client, its assets and every library that runs.

The document is mapped with the same code as a vanilla version. Cleanroom
replaces vanilla 1.12.2's LWJGL 2 with LWJGL 3, and the document lists LWJGL 3
and not LWJGL 2. The plugin does not filter the library list: what the document
declares is what runs. The client jar goes last on the classpath, as in the
`minecraft` plugin.

Nothing is installed by Cleanroom on the launching machine before the game
starts. The [metadata](/internals/metadata) page describes the documents and
how they are generated.

## Example

<<< @/examples/plugin-cleanroom-basic/opys.config.mjs

Run `opys build` to write `game.opys`, or `opys launch` to start the game from
the config. Mods go alongside the loader. See [Mods and files](/guide/mods).
