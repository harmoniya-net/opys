# Java

This page covers the `java()` plugin: how it provides a JDK to the game, how to
choose its version and vendor, and which Java each Minecraft version needs. You
use it in every pack, and the default usually needs no thought beyond the
version number.

## What it does

`java('21')` adds a Java runtime to the manifest. It does not install anything
on your machine. By default it looks up a JDK for Linux, macOS and Windows, each
on `x86_64` and `aarch64`, and leaves out any platform the vendor has no build
for. Each platform's archive is an artifact with an OS and architecture rule, so
a player downloads only the JDK that matches their computer. The installer
unpacks it into `${java_runtime_dir}/jdk-21/`.

The plugin owns three variables and one launch group:

| Name                 | What it is                                                         |
| -------------------- | ------------------------------------------------------------------ |
| `java_runtime_dir`   | Where JDKs are unpacked. Defaults to `${root}/runtimes`.           |
| `java_home`          | The JDK's root directory. On macOS this includes `/Contents/Home`. |
| `java_bin`           | The `java` executable inside it.                                   |
| `bin` (launch group) | Same as `java_bin`. Use it for `command`.                          |

Point `command` at the launch group, so the game starts on the JDK the plugin
provided:

```js
plugins: [forge('1.20.1'), java('17')],
manifest: {
  command: ({ java }) => java.bin,
  // args, workdir ...
},
```

The plugin also exports `JAVA_HOME` in the launch environment, set to
`${java_home}`. Tools started at launch, such as the GPU launcher, find the JDK
that way.

::: tip Pin the version, not the path
Never write a path to a JDK on your own disk into `manifest`. The manifest is
the same for every player, and `java_home` is already the right path on each
machine. See [Launch-time values](./run-client) for the values that do belong
to the launching machine.
:::

### Where the JDK is unpacked

`java_runtime_dir` follows `root`, so the JDKs move with the rest of the
installation. To put them somewhere else, set the variable. A path on the
player's machine, such as `/opt/jdks`, is a launch-time value and belongs in
`runClient`, not in `manifest.vars`:

```js
runClient: (manifest) => ({
  vars: { ...manifest.vars, java_runtime_dir: '/opt/jdks' },
}),
```

The downloaded archives go into `java_runtime_dir` as well, next to the unpacked
`jdk-<major>/` directory. Leave them there. The installer unpacks the archive
again on every install, so a deleted archive is downloaded again.

### Windows

On Windows, `java_bin` points at `javaw.exe` by default, so the game runs without
a console window. Pass `--feature java_console` to `opys launch` or
`opys install` to use `java.exe` instead, which lets you see the game's output
in a terminal:

```sh
opys launch --feature java_console
```

## Choosing a version

The first argument is the version, a string. Pass a major version to get the
latest release of that major, or pass an exact build to get that build. What an
exact build looks like depends on the vendor:

| Vendor    | Major  | Exact build     | Java 8 update |
| --------- | ------ | --------------- | ------------- |
| `temurin` | `'21'` | `'21.0.12.1+1'` | `'8u312-b07'` |
| `zulu`    | `'21'` | `'21.0.12'`     | `'8.0.312'`   |
| `graalvm` | `'21'` | `'21.0.2'`      | Not available |

The details for each vendor:

- **Temurin** takes the release name as Adoptium writes it: `'21.0.12.1+1'` for
  Java 9 and later, `'8u312-b07'` for Java 8. You may include the `jdk-` or
  `jdk8u` prefix, and a `-LTS` suffix on a major version is ignored. An
  incomplete name such as `'21.0.12'` matches nothing.
- **Zulu** passes the version to Azul's `java_version` filter unchanged, so the
  value must be written the way Azul writes it. A major such as `'7'` works,
  and so does a dotted version such as `'21.0.12'` or `'8.0.312'`. Azul may
  answer with a longer version than you wrote: `'21.0.12'` returns JDK
  `21.0.12.1`.
- **GraalVM CE** takes a major, which picks the newest `jdk-<major>.*` release,
  or a dotted version that it turns into a `jdk-<version>` tag. Only the
  standard `jdk-<major>.<minor>.<patch>` release cadence is supported. An
  Innovation tag such as `graal-25.2.4` is rejected at build time.

If no release matches, the build fails with
`No <vendor> binaries found for version '…'`. Check the spelling against the
vendor's own release list.

::: warning Zulu ignores a version it cannot read
Azul's API does not reject a `java_version` it does not understand. It answers
with its newest JDK instead. `java('8u312-b07', { vendor: 'zulu' })`, which is
Adoptium's spelling, builds without an error and provides the newest Zulu, not
Java 8. Read the `[java]` line the build prints, such as
`[java] Zulu 8.58.0.13 (JDK 8.0.312)`, and check that it names the JDK you
meant.
:::

## Vendors

Pick a vendor with the `vendor` option. The default is `temurin`.

| `vendor`    | Distribution                          | Source                                      |
| ----------- | ------------------------------------- | ------------------------------------------- |
| `'temurin'` | Eclipse Temurin, the Adoptium project | Adoptium API                                |
| `'zulu'`    | Azul Zulu                             | Azul Metadata API                           |
| `'graalvm'` | GraalVM Community Edition             | `graalvm/graalvm-ce-builds` GitHub releases |

GraalVM here means the Community Edition built from `graalvm/graalvm-ce-builds`.
Oracle's own GraalVM distribution is not one of the options.

```js
java('7', { vendor: 'zulu' });
java('21', { vendor: 'graalvm' });
```

## Options

The second argument takes these options. The full list, with types, is on
[the `java` plugin page](/plugins/java).

| Option      | Use it for                                                                                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vendor`    | `'temurin'` (default), `'zulu'` or `'graalvm'`.                                                                                                                                                            |
| `platforms` | The platforms to provide a JDK for, as `{ os, arch }` pairs. `os` is `'linux'`, `'osx'` or `'windows'`; `arch` is `'x86_64'` or `'aarch64'`. The default is all three systems, each on both architectures. |
| `apiBase`   | Another API address. For Temurin and Zulu, a mirror of their API. For GraalVM, a GitHub Enterprise host.                                                                                                   |
| `token`     | A GitHub token, for higher rate limits. GraalVM only.                                                                                                                                                      |

The plugin fails at build time, not at launch, when no release matches the
version. A JDK is always pinned by a sha256 hash, so a player never receives an
unverified one.

::: warning Call it with the version first
`java('17')` is correct. `java({ version: '17' })` throws a `TypeError` as soon
as the config runs, because the version is the first argument.
:::

## Which Java for which Minecraft version

Use the table below. From 1.7.2 on, its rows are the Java majors in Mojang's own
version metadata for each release, except for 1.17 and 1.17.1, which Mojang
lists at 16 and which also run on 17.

| Minecraft version | `java(…)` |
| ----------------- | --------- |
| 1.0 to 1.16.5     | `'8'`     |
| 1.17 to 1.20.4    | `'17'`    |
| 1.20.5 to 1.21.x  | `'21'`    |
| 26.x              | `'25'`    |

Cleanroom (1.12.2) and lwjgl3ify (1.7.10) do not follow the table. Both exist to
run an old Minecraft on a current Java, and take `'25'`.

Two Forge builds need a Java outside the table:

- **Forge 1.7.2** predates Java 8 and does not start on it. It runs on Java 7,
  which Temurin does not publish, so you ask Zulu for it:

  ```js
  java('7', { vendor: 'zulu' });
  ```

- **Forge 1.16.4** reads a JDK internal that Java 8u321 changed. Use the last
  update before that change:

  ```js
  java('8u312-b07');
  ```

Neither is a limit of opys. Both come from the Forge builds themselves.
