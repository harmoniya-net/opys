# dgpuj

The `dgpuj` plugin starts the game through [dgpuj](https://github.com/harmoniya-net/dgpuj),
a small launcher that asks for the discrete GPU on machines with two graphics
chips. Use `dgpuj.bin` as the launch `command` in place of `java.bin`, and the
game runs on the discrete GPU where dgpuj can force it. dgpuj then starts the
JVM inside its own process. That is why it is a command and not a JVM argument:
the GPU choice is made for the process that creates the graphics context, and
a launcher that only spawns `java` cannot make that choice for the child.

## Signature

```ts
dgpuj(options?: DgpujOptions): ChainablePlugin
```

The plugin takes an options object or nothing. It has no positional argument.

## Versions

The `version` option selects which dgpuj release is bundled.

| Input                            | Resolves to                                         |
| -------------------------------- | --------------------------------------------------- |
| `'latest'` (default)             | The latest published release, excluding prereleases |
| `'prerelease'`                   | The newest release, prereleases included            |
| An exact tag, such as `'v0.3.0'` | That release                                        |

The plugin looks for the archives listed under [Platforms](#platforms). Releases
before `v0.3.0` ship bare binaries instead, so an earlier tag fails the build
with `No matching asset`, followed by the assets that release does have.

## Options

| Option      | Type              | Default                                        | Meaning                                                                                                                                                                         |
| ----------- | ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`   | `string`          | `'latest'`                                     | The release to bundle: `'latest'`, `'prerelease'`, or an exact tag                                                                                                              |
| `platforms` | `DgpujPlatform[]` | The five targets under [Platforms](#platforms) | The build targets to bundle. Each entry is a `DgpujPlatform` with `os`, `arch`, `target`, `ext` and `bin`. The default list is `DEFAULT_PLATFORMS`, exported from `@opys/dgpuj` |
| `repo`      | `string`          | `'harmoniya-net/dgpuj'`                        | The GitHub repository to read releases from, as `owner/name`. Also exported as `DEFAULT_REPO`                                                                                   |
| `token`     | `string`          | None                                           | A GitHub token, to raise the API rate limit. Used at build time only                                                                                                            |
| `apiBase`   | `string`          | `https://api.github.com`                       | The GitHub API base URL, for a GitHub Enterprise host or a mirror.                                                                                                              |

Most packs need none of these. The `platforms` option takes `DgpujPlatform`
objects, not the `{ os, arch }` pairs that the [java](./java) plugin takes.

## Launch groups

| Group  | Expands to                  | Use                                                           |
| ------ | --------------------------- | ------------------------------------------------------------- |
| `bin`  | `${dgpuj_bin}`              | The launcher. This is the command                             |
| `home` | `--dgpuj-home ${java_home}` | Tells dgpuj where the JDK is. Put it before the JVM arguments |

`home` reads `${java_home}`, which only the [java](./java) plugin defines. Use
`home` with `java` in the same config. Leave it out if you do not use `java`.

## Variables

The plugin owns these two variables.

| Variable    | Value                                                                        | Meaning                                              |
| ----------- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| `dgpuj_dir` | `${root}/dgpuj`                                                              | The directory the launcher archive is extracted into |
| `dgpuj_bin` | `${dgpuj_dir}/dgpuj.exe` on Windows, `${dgpuj_dir}/dgpuj` on Linux and macOS | The launcher binary                                  |

The plugin sets no environment variables of its own. The `java` plugin sets
`JAVA_HOME`, and that is how dgpuj finds the JDK when `home` is left out.

## Platforms

Releases from `v0.3.0` on publish five targets. Each one is its own archive,
and the install downloads only the archive for the launching machine:

| OS      | Architecture | Archive                                 |
| ------- | ------------ | --------------------------------------- |
| Windows | `x86_64`     | `dgpuj-x86_64-pc-windows-msvc.zip`      |
| Windows | `aarch64`    | `dgpuj-aarch64-pc-windows-msvc.zip`     |
| Linux   | `x86_64`     | `dgpuj-x86_64-unknown-linux-gnu.tar.gz` |
| macOS   | `x86_64`     | `dgpuj-x86_64-apple-darwin.tar.gz`      |
| macOS   | `aarch64`    | `dgpuj-aarch64-apple-darwin.tar.gz`     |

There is no Linux `aarch64` archive. On a Linux `aarch64` machine nothing is
installed at `${dgpuj_bin}`, so the launch fails. A pack that must run there
should leave dgpuj out.

On Linux, dgpuj sets NVIDIA's render-offload variables, and only when the
proprietary NVIDIA driver is present. On macOS, dgpuj does not force a GPU: the
system chooses, and dgpuj only starts the JVM.

Every archive is pinned by sha256. The build reads the digest from GitHub, or
downloads the archive and hashes it when GitHub has none.

## Use it in a config

Add `dgpuj()` beside `java`, and use `dgpuj.bin` as the command. Pass
`dgpuj.home` before the JVM arguments so dgpuj finds the JDK:

```js
import { dgpuj, java, minecraft } from '@opys/minecraft';

plugins: [minecraft('1.21.1'), java('21'), dgpuj()],
manifest: {
  command: ({ dgpuj }) => dgpuj.bin,
  args: ({ dgpuj, minecraft }) => [
    dgpuj.home,
    minecraft.jvmArgs,
    minecraft.mainClass,
    minecraft.gameArgs,
  ],
  workdir: '${game_directory}',
},
```

Without `home`, the JDK is found through `JAVA_HOME`, which the `java` plugin
sets. With no `java` plugin, set `JAVA_HOME` yourself or pass
`--dgpuj-jvm <path>`; both are dgpuj's own, described in
[its README](https://github.com/harmoniya-net/dgpuj).

The complete example below uses the `java` plugin and `home`, and launches
vanilla 1.21.1:

<<< @/examples/plugin-dgpuj-basic/opys.config.mjs

::: tip
The Windows launcher is `dgpuj.exe`. The config does not need to name it. The
`dgpuj_bin` variable chooses the file for each platform.
:::

For the JDK that dgpuj starts, see the [java](./java) plugin. For the other
plugins, see the [plugins page](./index).
