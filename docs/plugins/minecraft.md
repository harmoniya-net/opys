# minecraft

`minecraft()` adds the vanilla Minecraft client to your installation: the game
jar, its libraries, its natives and its assets, for any version Mojang has
published. Use it for a pack with no mod loader, and pair it with a
[Java runtime](./java). The loader plugins, such as `forge` or `fabric`,
already contribute the vanilla game they build on, so do not add `minecraft()`
beside one. This page is for pack authors. If you write a loader, see
[`@opys/minecraft-vanilla`](./minecraft-vanilla) for the functions underneath.

## Signature

```ts
minecraft(version?: string, options?: {
  manifestBase?: string;
}): ChainablePlugin
```

Both arguments are optional. Calling `minecraft()` does no network work; the
lookups happen when `opys build` or `opys launch` builds the config. It is
exported from `@opys/minecraft` and from `@opys/minecraft-vanilla`.

## Version

`version` is an exact id from Mojang's version manifest, compared as a string.
Anything the manifest lists works, including snapshot ids such as `24w14a`;
the `type` field of each entry tells the kinds apart.

- `minecraft('1.21.1')` takes that version.
- `minecraft()` takes the version the manifest names as its latest release.
- `minecraft('latest')` is not an alias. It is not in the manifest, so the
  build fails.

An id the manifest does not list fails the build with
`Version '<id>' not found in the Mojang version manifest`.

::: tip Pinning the version
Name the version. Omitting it builds against whatever Mojang's latest release
is on the day you build, so two builds of the same config can differ.
:::

## Options

| Option         | Type     | Default                             | Meaning                                                           |
| -------------- | -------- | ----------------------------------- | ----------------------------------------------------------------- |
| `manifestBase` | `string` | Mojang's `version_manifest_v2.json` | URL of the version manifest to read instead. Set it for a mirror. |

`manifestBase` replaces the URL of the version manifest and nothing else. The
version JSON and the asset index are fetched from the URLs the documents give.
Asset objects always come from `resources.download.minecraft.net`, whatever
`manifestBase` says.

## Launch groups

The plugin is named `minecraft`, so its groups are read as `minecraft.<group>`
in `manifest.command` and `manifest.args`. Each is the piece of the launch
command that Mojang's version JSON describes.

| Group                 | Type     | Contains                                                                                                                        |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `minecraft.command`   | string   | `${java_bin}`, the Java binary the [`java`](./java) plugin provides. The examples use `java.bin` for `manifest.command` instead |
| `minecraft.jvmArgs`   | `Valset` | The JVM arguments from the version JSON, with their rules, including the classpath                                              |
| `minecraft.mainClass` | `Val`    | The game's main class                                                                                                           |
| `minecraft.gameArgs`  | `Valset` | The game arguments from the version JSON, with their rules                                                                      |

A `Val` is a value that may carry rules, and a `Valset` is a list of them. See
[Val and Valset](/reference/manifest#val-and-valset). The groups are separate
so you can put your own arguments between them. Put them in `manifest.args` in
the order the game needs them:

```js
args: ({ minecraft }) => [
  minecraft.jvmArgs,
  minecraft.mainClass,
  minecraft.gameArgs,
],
```

## Variables

The plugin defines these variables. A manifest or a launch can refer to them
as `${name}`.

| Variable              | Value                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `root`                | `.` until the launching machine sets it, usually to a directory from `userDataDir()`                  |
| `launcher_name`       | `opys`                                                                                                |
| `launcher_version`    | The opys version                                                                                      |
| `version_type`        | The release type from the version JSON, such as `release`                                             |
| `version_name`        | The version id, such as `1.21.1`                                                                      |
| `game_directory`      | `${root}/`                                                                                            |
| `assets_root`         | `${root}/assets`                                                                                      |
| `game_assets`         | The directory the game is handed for its assets. See [asset layouts](/reference/asset-layouts)        |
| `assets_index_name`   | The asset index id, such as `1.20` or `legacy`                                                        |
| `version_dir`         | `${root}/versions/${version_name}`                                                                    |
| `library_directory`   | `${root}/libraries`                                                                                   |
| `natives_directory`   | `${version_dir}/natives`                                                                              |
| `classpath`           | The libraries the operating system's rules allow, then the client jar. One value per operating system |
| `classpath_separator` | `;` on Windows, `:` on Linux and macOS                                                                |
| `auth_player_name`    | `${username}`                                                                                         |
| `auth_uuid`           | `${uuid}`                                                                                             |
| `auth_session`        | `${token}`                                                                                            |
| `auth_access_token`   | `${token}`                                                                                            |
| `user_type`           | `mojang`                                                                                              |
| `user_properties`     | `{}`                                                                                                  |
| `clientid`            | Empty                                                                                                 |

`username`, `uuid` and `token` are not defined by the plugin and have no
default, so the launching machine must supply them. So must `root`, if the game
should live anywhere but `.`. Set them in `runClient`, as
[Launch-time values](/guide/run-client) describes, or with `--var` when you
launch a bundle. The full list of names, with the `java` ones, is in
[Variables](/launcher/vars).

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
plugins: [minecraft('1.21.1'), java('21')],
```

## How it works

`minecraft()` makes three requests at build time: the version manifest, the
version JSON of the version you named, and its asset index. It turns them into
four kinds of thing:

- **The client jar.** One artifact at `${version_dir}/client.jar`, pinned by the
  sha1 and size in the version JSON.
- **Libraries.** One artifact per library, at
  `${library_directory}/<maven path>`. Each keeps the rules from the version
  JSON, so a library a platform does not need is not downloaded there. A
  library with no sha1 in its version JSON is downloaded without a hash to
  check.
- **Natives.** A native library is extracted into `${natives_directory}` when
  it is installed. Older version JSONs list natives under `natives`, newer ones
  name a `natives-…` classifier. The extraction runs with its `clean` flag set
  and skips `META-INF/`.
- **Assets.** The asset index as `${assets_root}/indexes/<id>.json`, and one
  artifact per asset object, each pinned by its sha1. Where the objects go
  depends on the version. See [asset layouts](/reference/asset-layouts).

It also contributes the variables above and the four launch groups. The
classpath is built for each operating system separately, and the client jar
always comes last on it, after every library.

## Example

This config installs vanilla 1.21.1 and starts it with a Java 21 runtime. It
is the same file the [getting started](/guide/getting-started) guide uses:

<<< @/examples/vanilla/opys.config.mjs

To read the version manifest from a mirror, pass the options object:

```js
plugins: [
  minecraft('1.21.1', {
    manifestBase: 'https://mirror.example.com/mc/version_manifest_v2.json',
  }),
  java('21'),
],
```

Every value in `runClient` is supplied when the game starts, so the bundle
built from this config carries no username, no token and no path from your
machine. See [the config file](/guide/config) for the rest of the fields.
