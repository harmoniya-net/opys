# Variables

This page covers the names a manifest uses for paths and for the player, the
`${name}` syntax that puts them in place, and what you pass when you launch.
It lists every name a Minecraft manifest leaves open for your launcher, and
every name it defines itself.

A manifest is built once and given to every player, so it cannot hold a path
on your disk or a player's account. It uses a name instead, and the launching
machine supplies the value. For the functions that take these values, see
[Install and launch](/launcher/embedding). The division between the two
machines is explained in [Concepts](/guide/concepts#two-machines-and-what-belongs-to-each).

## How `${name}` works

A `${name}` in an artifact's path, in the launch command, in an argument, in an
environment value or in the working directory is replaced by the value of
`name` when the runtime uses it.

- A value can refer to other names. `version_dir` is
  `${root}/versions/${version_name}`, and both names are resolved first.
- Values come from two places. The manifest's own vars are the base, for the
  platform and features in effect. The `vars` you pass are layered over them,
  so yours win.
- A name that nothing defines stays as written. A `${username}` with no
  username passed reaches the game as the literal text `${username}`. The
  runtime does not report it.
- `\${` produces a literal `${`.
- A cycle, where a name refers back to itself through other names, fails with
  code `other`.
- The values you pass go through the same substitution, so a value that
  contains `${x}` is expanded.

## What the launcher passes

```js
import { launch } from '@opys/runtime';

await launch(
  { bundle },
  {
    vars: { root, username, uuid, token, java_bin },
  },
);
```

Every value is a string. A call to `launch` applies its `vars` to both its
install and the launch; when you call `install` and `buildLaunch` separately,
pass the same `vars` to each. `opys launch <bundle> --var key=value` passes the
same values from the command line, and `--var` takes precedence over the
manifest's own vars in the same way.

`root` should always be passed, as an absolute path. Left out, it is `.`, which
is relative to the launcher's working directory, so the game would be installed
wherever the launcher was started.

## Left open by a Minecraft manifest

These names are used by the manifest and not given a value by it, or are given
only a default that a launcher should replace.

| Name       | Used for                                                         | Notes                                                                                        |
| ---------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `root`     | The base directory. Every default path is under it.              | The `minecraft` plugin defines it as `.`. Pass an absolute path.                             |
| `username` | The player name (`auth_player_name`).                            | No default. Without it the game receives `${username}`.                                      |
| `uuid`     | The player id (`auth_uuid`).                                     | No default.                                                                                  |
| `token`    | The access token (`auth_session`, `auth_access_token`).          | No default. `0` starts the game offline, as [Getting started](/guide/getting-started) shows. |
| `java_bin` | The program the launch runs. The usual command is `${java_bin}`. | The `java` plugin defines it. A manifest without that plugin leaves it to you.               |

`java_bin` is the only one of these the launch command itself needs. Pass the
path of a Java executable, or include the [`java`](/guide/java) plugin so the
manifest provides one.

## Defined by the manifest

The `minecraft` plugin defines these names for every version. Passing a value
for any of them overrides it, but none normally needs one.

| Name                  | Value                                                                                | Meaning                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `launcher_name`       | `opys`                                                                               | The launcher name the game reports.                                                                    |
| `launcher_version`    | opys's own version, as released.                                                     | The version the game reports.                                                                          |
| `version_type`        | The version JSON's `type`, such as `release`.                                        | The release type of the Minecraft version.                                                             |
| `version_name`        | The version's id: `1.21.1` for vanilla, the loader's own id otherwise.               | The name of the version. Part of `version_dir`.                                                        |
| `game_directory`      | `${root}/`                                                                           | The game's directory, with a trailing slash. Saves, options and mods live here.                        |
| `assets_root`         | `${root}/assets`                                                                     | The asset store.                                                                                       |
| `game_assets`         | `${assets_root}`, `${assets_root}/virtual/<index>`, or `${game_directory}/resources` | The directory old versions read assets from, by name. The value depends on the version's asset layout. |
| `assets_index_name`   | The asset index id.                                                                  | The index the game reads.                                                                              |
| `version_dir`         | `${root}/versions/${version_name}`                                                   | Holds the client jar and the natives.                                                                  |
| `library_directory`   | `${root}/libraries`                                                                  | Where every library is kept.                                                                           |
| `natives_directory`   | `${version_dir}/natives`                                                             | Where native libraries are extracted.                                                                  |
| `auth_player_name`    | `${username}`                                                                        | The player name.                                                                                       |
| `auth_uuid`           | `${uuid}`                                                                            | The player id.                                                                                         |
| `auth_session`        | `${token}`                                                                           | The access token.                                                                                      |
| `auth_access_token`   | `${token}`                                                                           | The access token, under a second name.                                                                 |
| `user_type`           | `mojang`                                                                             | The account type.                                                                                      |
| `user_properties`     | `{}`                                                                                 | The account's properties. Empty.                                                                       |
| `clientid`            | Empty.                                                                               | The client id. Empty.                                                                                  |
| `classpath_separator` | `;` on Windows, `:` on Linux and macOS.                                              | The separator used between the entries of `classpath`.                                                 |
| `classpath`           | The library paths and the client jar, for this operating system.                     | The value of `-cp`. The client jar comes last, after every library.                                    |

The `java` plugin defines three more, and sets one environment variable:

| Name               | Value                                                                                                         | Meaning                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `java_runtime_dir` | `${root}/runtimes`                                                                                            | Where JDKs are installed. Override it to move them.                |
| `java_home`        | The JDK directory. On macOS it ends in `/Contents/Home`.                                                      | The Java home directory.                                           |
| `java_bin`         | The java executable. On Windows, `javaw.exe` unless the `java_console` feature is on (pass it in `features`). | The program the launch runs.                                       |
| `JAVA_HOME`        | `${java_home}`                                                                                                | Environment variable, set so tools started at launch find the JDK. |

A loader adds no names of its own. Forge, NeoForge and Fabric define
`classpath` again, with their own libraries ahead of the vanilla ones. Cleanroom
and lwjgl3ify read a complete version document and define the same names;
`version_name` is that document's id, such as `1.12.2-Cleanroom-0.6.13-alpha`,
so `version_dir` follows it.
Other plugins define names for their own files, such as `dgpuj_dir` and
`dgpuj_bin` from the `dgpuj` plugin. They are defined by the manifest and need
nothing from the launcher.

## Names the game's arguments may use

A version's own argument list can refer to names that opys does not define.
Version JSONs carry `--width ${resolution_width} --height ${resolution_height}`
behind the `has_custom_resolution` feature, and `--demo` behind
`is_demo_user`. The names `resolution_width` and `resolution_height` have no
value unless you give one, and the feature is off unless you pass it. Both are
needed to set a window size:

```js
await launch(
  { bundle },
  {
    features: ['has_custom_resolution'],
    vars: { root, resolution_width: '1280', resolution_height: '720' },
  },
);
```

With the feature on and no value passed, the argument reaches the game as the
literal text `${resolution_width}`. With the feature off, the argument is left
out.
