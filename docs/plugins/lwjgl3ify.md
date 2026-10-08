# lwjgl3ify

`lwjgl3ify()` adds [lwjgl3ify](https://github.com/GTNewHorizons/lwjgl3ify) to
your installation: the game, its libraries and assets, and two jars in
`mods/`, lwjgl3ify itself and UniMixins, which lwjgl3ify needs. lwjgl3ify runs
Forge on Minecraft 1.7.10 with LWJGL 3 and a modern Java. Use it to make a
1.7.10 pack that does not need the old LWJGL 2 runtime. Use it in place of
`minecraft()` and `forge()`, since it already contributes the game, and pair it
with a [Java runtime](./java). This page is for pack authors. For how loaders
fit into a config, see [Loaders](/guide/loaders).

## Signature

```ts
lwjgl3ify(version: string, opts?: {
  source?: string;
  repo?: string;
  token?: string;
  apiBase?: string;
  unimixins?: { version?: string; repo?: string } | false;
}): ChainablePlugin
```

`version` is the only required argument. Calling `lwjgl3ify()` does no network
work; the lookups happen when `opys build` or `opys launch` builds the config.
It is exported from `@opys/minecraft` and from `@opys/lwjgl3ify`.

## Version

`version` takes one of three forms. The plugin tries them in this order.

| Form                         | Example                                              | Resolves to                                            |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| Alias on a Minecraft version | `1.7.10-latest`, `1.7.10-recommended`, `1.7.10-best` | That promotion of the Minecraft version                |
| Minecraft version            | `1.7.10`                                             | Its `best` release                                     |
| Release tag                  | `3.0.37`                                             | That exact release. Its Minecraft version is looked up |

lwjgl3ify has no promotions endpoint, so the index says what each alias means.
`latest` is the newest release. `recommended` is the newest release GitHub
does not mark as a prerelease. `best` is `recommended` when there is one, and
`latest` otherwise. A bare Minecraft version means `best`. The index has one
Minecraft version, `1.7.10`.

A bare Minecraft version or an alias follows the index, so it can resolve to a
newer release later. Name a release tag to pin one.

If the version cannot be resolved, the build stops with one of these messages:

| Message                                                       | Cause                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| `Unknown Minecraft version '<mc>' (resolving '<input>')`      | An alias on a Minecraft version the index does not list       |
| `No '<alias>' lwjgl3ify build available for Minecraft <mc>`   | The Minecraft version has no build for that alias             |
| `Could not resolve lwjgl3ify version '<input>' from <source>` | Neither a Minecraft version nor a release tag the index lists |

## Options

| Option      | Type                | Default                                              | Meaning                                                                    |
| ----------- | ------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| `source`    | `string`            | `https://harmoniya-net.github.io/metadata/lwjgl3ify` | Base URL of the document index. Set it for a mirror.                       |
| `repo`      | `string`            | `GTNewHorizons/lwjgl3ify`                            | GitHub repository the lwjgl3ify mod jar is released from, as `owner/name`. |
| `token`     | `string`            | None: anonymous requests                             | A GitHub token. Use it when you hit GitHub's anonymous rate limit.         |
| `apiBase`   | `string`            | `https://api.github.com`                             | GitHub API base URL, for GitHub Enterprise or a mirror.                    |
| `unimixins` | `object` or `false` | The latest UniMixins release                         | Which UniMixins jar to put in `mods/`. `false` leaves it out.              |

There is no `manifestBase`: lwjgl3ify's document is a whole version, so no
Mojang version manifest is read.

`unimixins` takes its own options:

| Option              | Type     | Default                     | Meaning                                                                                                                                                                                   |
| ------------------- | -------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unimixins.version` | `string` | `'latest'`                  | `'latest'`, `'prerelease'`, or a UniMixins release tag. `'latest'` is the newest stable release that carries the 1.7.10 jar, and `'prerelease'` the newest release of any kind that does. |
| `unimixins.repo`    | `string` | `LegacyModdingMC/UniMixins` | GitHub repository the UniMixins jar is released from, as `owner/name`.                                                                                                                    |

::: warning
`unimixins: false` removes the UniMixins jar from `mods/`. lwjgl3ify's coremod
implements an interface that UniMixins provides, so lwjgl3ify does not load
without UniMixins. Use `false` only when your pack provides its own mixin
runtime in `mods/`.
:::

## Launch groups

The plugin is named `lwjgl3ify`, so its groups are read as `lwjgl3ify.<group>`
in `manifest.command` and `manifest.args`.

| Group                 | Type     | Contains                                                                                                                        |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `lwjgl3ify.command`   | string   | `${java_bin}`, the Java binary the [`java`](./java) plugin provides. The examples use `java.bin` for `manifest.command` instead |
| `lwjgl3ify.jvmArgs`   | `Valset` | The JVM arguments from the lwjgl3ify version document                                                                           |
| `lwjgl3ify.mainClass` | `Val`    | The main class from the document. It differs between releases                                                                   |
| `lwjgl3ify.gameArgs`  | `Valset` | The game arguments from the document                                                                                            |

Put them in `manifest.args` in the order the game needs them:

```js
manifest: {
  command: ({ java }) => java.bin,
  args: ({ lwjgl3ify }) => [
    lwjgl3ify.jvmArgs,
    lwjgl3ify.mainClass,
    lwjgl3ify.gameArgs,
  ],
  workdir: '${game_directory}',
},
```

## Variables

`lwjgl3ify()` defines the same variables as [`minecraft`](./minecraft#variables),
with two differences. `classpath` is built from the libraries of lwjgl3ify's
own document, and `version_name` and `version_type` come from that document and
not from a vanilla version: for `3.0.37`, `version_name` is
`1.7.10-Forge10.13.4.1614-1.7.10-lwjgl3ify-3.0.37`, and `version_dir` is built
from that name.

`root` is `.` until the launching machine sets it. `username`, `uuid` and
`token` are not defined at all, so the launching machine must supply them. The
[launch-time values](/guide/run-client) page says how. `lwjgl3ify()` does not
define `java_bin`, `java_home` or `java_runtime_dir`. The [`java`](./java)
plugin does.

## Which Java

Use Java 25: `java('25')`. Running 1.7.10 on a current Java is what lwjgl3ify
is for, and the current release declares Java 25. opys does not check the
pairing, so a mismatch fails when the game starts, not when you build.

```js
plugins: [lwjgl3ify('1.7.10'), java('25')],
```

Not every vendor ships Java 25 for every platform; see
[Platforms](./java#platforms).

## How it works

lwjgl3ify has no installer. Each release ships a complete version document, and
the index republishes it with every library given a path, a hash and a size. So
`lwjgl3ify()` makes the same three requests as [Cleanroom](./cleanroom): the
index, to find the release, then the release's document, then the asset index
the document names. The document is mapped with the same code as a vanilla
version, and it does not inherit from a vanilla version, so no vanilla version
is fetched. The client jar goes last on the classpath, as in the `minecraft`
plugin.

The two mod jars are a different case. A version document cannot say that a
file belongs in `mods/`, so the plugin reads them from GitHub Releases. It
looks up the lwjgl3ify release by its tag, because the index already names it,
and takes the plain `lwjgl3ify-<tag>.jar`. It takes UniMixins's all-in-one
`+unimixins-all-1.7.10-<version>.jar` from the release you chose. Both are
added to the artifact list under `${game_directory}/mods/`, and neither goes on
the classpath. Each is pinned by sha256: to the digest GitHub publishes for it
or, for a release with no digest, to a hash computed from the downloaded file.
The [metadata](/internals/metadata) page describes the documents and how they
are generated.

## Example

<<< @/examples/plugin-lwjgl3ify-basic/opys.config.mjs

Run `opys build` to write `game.opys`, or `opys launch` to start the game from
the config. Mods go alongside the loader. See [Mods and files](/guide/mods).
