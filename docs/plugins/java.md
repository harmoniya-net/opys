# java

`java()` provides a Java runtime for every platform, so the game runs on the
JDK opys installs and not on whatever the launching machine has. Add
`java('21')` to `plugins`, then point the launch `command` at `java.bin`. The
JDK comes from Eclipse Temurin unless you choose Azul Zulu or GraalVM Community
Edition with `vendor`. At build time opys asks the vendor's API for one archive
per platform and pins its sha256. The launching machine downloads and extracts
only the archive for its own platform. This page is for pack authors. For which
Java each Minecraft version needs, see [Java](/guide/java).

## Signature

```ts
java(version: string, options?: {
  vendor?: 'temurin' | 'zulu' | 'graalvm';
  platforms?: { os: 'linux' | 'osx' | 'windows'; arch: 'x86_64' | 'aarch64' }[];
  apiBase?: string;
  token?: string;
}): ChainablePlugin
```

`version` is the first argument and is a string. `java({ version: '17' })` is
rejected with a `TypeError` that shows the right call. Calling `java()` does no
network work; the lookups happen when `opys build` or `opys launch` builds the
config. It is exported from `@opys/minecraft` and from `@opys/java`, which also
exports each vendor's resolver (`resolveTemurin`, `resolveZulu`,
`resolveGraalvm`) if you need release metadata without the plugin.

## Version

`version` takes a major version or an exact build. Which exact spellings work
depends on the vendor.

| Input               | Vendor    | Resolves to                                                                                                            |
| ------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| `'21'`              | all       | The latest release of major 21. For `graalvm`, the newest `jdk-21.*` release                                           |
| `'21.0.12.1+1'`     | `temurin` | That Adoptium release. The `jdk-` prefix is added                                                                      |
| `'jdk-21.0.12.1+1'` | `temurin` | The same release, written with its full name                                                                           |
| `'8u492-b09'`       | `temurin` | The Java 8 release `jdk8u492-b09`                                                                                      |
| `'21.0.12'`         | `temurin` | Fails with "No Temurin binaries found". Temurin release names carry a build number, so give the full form              |
| `'21.0.12'`         | `zulu`    | Passed to Azul as `java_version`. The build returned can have a longer version: `21.0.12` came back as JDK `21.0.12.1` |
| `'21.0.2'`          | `graalvm` | The release tagged `jdk-21.0.2`                                                                                        |
| `'jdk-21.0.2'`      | `graalvm` | The release with that tag, used as written                                                                             |
| `'graal-25.2.4'`    | `graalvm` | Fails. Only tags of the form `jdk-<major>.…` are supported                                                             |

The build prints the release it resolved, as `[java] Temurin 21.0.12.1+1`.
Check that line after you change a version.

## Options

| Option      | Type                               | Default                                                                                                          | Meaning                                                                                                                                                    |
| ----------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vendor`    | `'temurin' \| 'zulu' \| 'graalvm'` | `'temurin'`                                                                                                      | The distribution. `temurin` is Eclipse Adoptium, `zulu` is Azul Zulu, `graalvm` is GraalVM Community Edition                                               |
| `platforms` | `{ os, arch }[]`                   | The six platforms listed under [Platforms](#platforms)                                                           | The platforms to provision. `os` is `'linux'`, `'osx'` or `'windows'`; `arch` is `'x86_64'` or `'aarch64'`. A platform the vendor does not ship is skipped |
| `apiBase`   | `string`                           | Adoptium `https://api.adoptium.net/v3`, Azul `https://api.azul.com/metadata/v1`, GitHub `https://api.github.com` | The vendor's API base URL. Set it for a mirror, or for the GitHub Enterprise API with `graalvm`                                                            |
| `token`     | `string`                           | None                                                                                                             | A GitHub token, to raise the API rate limit. Used by `graalvm` only. It is used at build time and is not written to the bundle                             |

To use another vendor, pass the option as the second argument:

```js
java('21', { vendor: 'zulu' });
```

## Launch groups

The plugin is named `java`, so its group is read as `java.bin` in
`manifest.command`.

| Group      | Type   | Contains      |
| ---------- | ------ | ------------- |
| `java.bin` | string | `${java_bin}` |

Use it as `command: ({ java }) => java.bin`.

## Variables

The plugin owns these variables. No other plugin should define them.

| Variable           | Value                             | Meaning                                                                                                       |
| ------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `java_runtime_dir` | `${root}/runtimes`                | Where the archives are downloaded and the JDKs are extracted. It follows `root`, so you rarely need to set it |
| `java_home`        | `${java_runtime_dir}/jdk-<major>` | The JDK directory. On macOS it ends in `/Contents/Home`                                                       |
| `java_bin`         | See below                         | The Java executable                                                                                           |

`java_bin` is `${java_home}/bin/java` on Linux and macOS. On Windows it is
`${java_home}/bin/javaw.exe`, which starts without a console window. With the
`java_console` feature on, it is `${java_home}/bin/java.exe` instead, so the
game's output is visible. Turn the feature on with
`opys launch --feature java_console`.

The plugin also sets the environment variable `JAVA_HOME` to `${java_home}`
in the manifest. Tools that the launch starts, such as [dgpuj](./dgpuj), find
the JDK through it.

## Platforms

By default the plugin provisions six platforms:

- Linux, `x86_64` and `aarch64`
- macOS (`osx`), `x86_64` and `aarch64`
- Windows, `x86_64` and `aarch64`

Vendors do not ship every platform for every version. At the time of writing:

| Input                      | Platforms that resolved                                              |
| -------------------------- | -------------------------------------------------------------------- |
| `temurin` `'21'`           | All six                                                              |
| `temurin` `'17'` or `'25'` | Five. There is no Windows `aarch64` build                            |
| `temurin` `'8'`            | Four. There is no macOS `aarch64` and no Windows `aarch64` build     |
| `zulu` `'21'` or `'25'`    | All six. The Linux builds are glibc builds, so musl systems get none |
| `zulu` `'7'`               | Three. `x86_64` on Linux, macOS and Windows                          |
| `graalvm` `'21.0.2'`       | Five. There is no Windows `aarch64` build                            |

A platform with no build is left out. For a major version, Temurin and Zulu are
asked once per platform, and a platform whose newest release differs from the
one most platforms agree on is dropped too, so that every platform lands on one
release. If no platform resolves, the build fails. If a launching machine is on
a platform that was left out, it gets no JDK, so check the vendor's list before
you ship a bundle for that platform.

## Integrity

Every archive is pinned by its sha256. Temurin and Zulu take it from their
APIs. GraalVM takes it from the GitHub asset digest, or from the `.sha256` file
next to the archive for older releases. If neither is available, the build
fails instead of shipping an unverified JDK.

## Example

Add `java` to `plugins`, and use `java.bin` as the command:

```js
plugins: [minecraft('1.21.1'), java('21')],
manifest: {
  command: ({ java }) => java.bin,
  args: ({ minecraft }) => [
    minecraft.jvmArgs,
    minecraft.mainClass,
    minecraft.gameArgs,
  ],
},
```

The plugin only supplies the binary. The arguments still come from the game
plugin, which here is `minecraft`. A `forge` or `fabric` config is the same,
with that plugin's groups in `args`. The complete example below uses the
default vendor and launches vanilla 1.21.1:

<<< @/examples/plugin-java-basic/opys.config.mjs

::: tip
`root` is set in `runClient`, not in `manifest`, so the JDK is extracted under
the launching machine's data directory and not under yours. Why the split
exists is explained in [Concepts](/guide/concepts).
:::

The other plugins are listed on the [plugins page](./index).
