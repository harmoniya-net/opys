# Vanilla Minecraft

The `minecraft` plugin, from `@opys/minecraft`.

The game as Mojang ships it, with no mod loader.

<!-- prettier-ignore -->
```js{4,8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: [
      '@minecraft.jvmArgs',
      '@minecraft.mainClass',
      '@minecraft.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

Every loader plugin is built on this one, so this page also describes what
they all have in common.

## Options

| Option         | What it does                                                              |
| -------------- | ------------------------------------------------------------------------- |
| `version`      | A Minecraft version. Left out: the current release.                       |
| `libraries`    | Libraries to add or replace. See [below](#adding-or-replacing-a-library). |
| `manifestBase` | A mirror of Mojang's version list.                                        |

Name the version. `minecraft()` alone takes whatever is current on the day
you build.

## What it adds

| Kind        | What                                           |
| ----------- | ---------------------------------------------- |
| Files       | The game jar, libraries, natives, assets.      |
| Launch      | `command`, `jvmArgs`, `mainClass`, `gameArgs`. |
| Variables   | Folders, and what the game is told.            |
| Environment | None.                                          |

Each one below: what it is, and how it ends up in the
[manifest](/format/).

### Files · the game jar

One file. Pinned by the hash Mojang publishes.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: [
      '@minecraft.jvmArgs',
      '@minecraft.mainClass',
      '@minecraft.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// in the manifest
{
  "path": "${version_dir}/client.jar",
  "source": { "url": "https://piston-data.mojang.com/v1/objects/30c7…/client.jar" },
  "size": 26836906,
  "integrity": { "sha1": "30c73b1c5da787909b2f73340419fdf13b9def88" }
}
```

### Files · libraries

About a hundred jars. One with native code has `rules`, so a Windows player
does not download Linux natives, and `extract`, which unpacks it.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: [
      '@minecraft.jvmArgs',
      '@minecraft.mainClass',
      '@minecraft.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// in the manifest
{
  "path": "${library_directory}/org/lwjgl/lwjgl-freetype/3.3.3/lwjgl-freetype-3.3.3-natives-linux.jar",
  "source": { "url": "https://libraries.minecraft.net/org/lwjgl/…-natives-linux.jar" },
  "size": 1245129,
  "rules": "allow.os.linux",
  "integrity": { "sha1": "149070a5480900347071b7074779531f25a6e3dc" },
  "extract": { "into": "${natives_directory}", "clean": true, "excludes": ["META-INF/"] }
}
```

### Files · assets

Sounds, textures, languages: a few thousand small files, and the index
that lists them. This is most of a manifest.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: [
      '@minecraft.jvmArgs',
      '@minecraft.mainClass',
      '@minecraft.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// in the manifest
{
  "path": "${assets_root}/objects/b6/b62ca8ec10d07e6bf5ac8dae0c8c1d2e6a1e3356",
  "source": { "url": "https://resources.download.minecraft.net/b6/b62c…" },
  "size": 9101,
  "integrity": { "sha1": "b62ca8ec10d07e6bf5ac8dae0c8c1d2e6a1e3356" },
  "metadata": { "name": "icons/icon_128x128.png" }
}
```

### Launch

The whole command line, as four pieces you put in order. The last game
arguments are switched on by [features](#features).

<!-- prettier-ignore -->
```js{8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: [
      '@minecraft.jvmArgs',
      '@minecraft.mainClass',
      '@minecraft.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// in the manifest
"launch": {
  // '@minecraft.command'
  "command": "${java_bin}",
  "args": [
    // '@minecraft.jvmArgs'
    { "rules": "allow.os.osx", "value": ["-XstartOnFirstThread"] },
    "-Djava.library.path=${natives_directory}",
    "-Dminecraft.launcher.brand=${launcher_name}",
    // … a few more
    "-cp",
    "${classpath}",
    // '@minecraft.mainClass'
    "net.minecraft.client.main.Main",
    // '@minecraft.gameArgs'
    "--username", "${auth_player_name}",
    "--version", "${version_name}",
    "--gameDir", "${game_directory}",
    "--assetsDir", "${assets_root}",
    "--uuid", "${auth_uuid}",
    "--accessToken", "${auth_access_token}",
    // … a few more
    { "rules": "allow.features.is_demo_user", "value": ["--demo"] },
    {
      "rules": "allow.features.has_custom_resolution",
      "value": ["--width", "${resolution_width}", "--height", "${resolution_height}"]
    }
  ],
  "workdir": "${game_directory}"
}
```

| You write                | Becomes                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `'@minecraft.command'`   | The program to run: whatever Java the pack has.               |
| `'@minecraft.jvmArgs'`   | Arguments for Java itself, ending with the classpath.         |
| `'@minecraft.mainClass'` | The class to start. One argument.                             |
| `'@minecraft.gameArgs'`  | Arguments for the game: who is playing, and where things are. |

**Why four pieces:** so you can put your own arguments between them. JVM
flags go before the main class, game flags after.

### Variables

Three groups. All of them are in the manifest's `vars`.

#### Folders

Everything hangs off `root`. Move `root`, and the whole installation
moves. Use these in `to` and in paths of your own.

<!-- prettier-ignore -->
```jsonc
// in the manifest
"vars": {
  "root": ".",
  "game_directory": "${root}/",                       // saves, mods, options
  "library_directory": "${root}/libraries",
  "assets_root": "${root}/assets",
  "version_dir": "${root}/versions/${version_name}",  // the game jar
  "natives_directory": "${version_dir}/natives"
}
```

#### The player

The game expects these names. Each one points at a variable the manifest
does **not** define.

<!-- prettier-ignore -->
```jsonc
// in the manifest
"vars": {
  "auth_player_name": "${username}",
  "auth_uuid": "${uuid}",
  "auth_access_token": "${token}",
  "auth_session": "${token}"
}
```

So `username`, `uuid` and `token` are **left open**, together with `root`.
Set them in [`run`](/basics/config#run), with `--var`, or from a launcher.

| Name       | What it is                                | If you leave it out                        |
| ---------- | ----------------------------------------- | ------------------------------------------ |
| `root`     | The folder everything is installed under. | `.`, the current directory. Always set it. |
| `username` | The player's name.                        | The game gets the text `${username}`.      |
| `uuid`     | The player's ID.                          | The game gets the text `${uuid}`.          |
| `token`    | The access token. `0` plays offline.      | The game gets the text `${token}`.         |

**Why open:** they differ per player, and a bundle is the same for
everyone.

#### What the game is told

You can ignore these. The game's own arguments refer to them.

<!-- prettier-ignore -->
```jsonc
// in the manifest
"vars": {
  "version_name": "1.21.1",
  "version_type": "release",
  "assets_index_name": "17",
  "game_assets": "${assets_root}",
  "launcher_name": "opys",
  "launcher_version": "0.2.0",
  "user_type": "mojang",
  "user_properties": "{}",
  "clientid": "",
  "classpath_separator": [
    { "value": ";", "rules": "allow.os.windows" },
    { "value": ":", "rules": "allow.os.linux" },
    { "value": ":", "rules": "allow.os.osx" }
  ],
  "classpath": [/* every library, then the game jar, per OS */]
}
```

## Features

Switches a launcher or `--feature` can turn on. These two come from the
game's own data:

| Feature                 | Effect                                                                     |
| ----------------------- | -------------------------------------------------------------------------- |
| `has_custom_resolution` | Passes a window size. Also set `resolution_width` and `resolution_height`. |
| `is_demo_user`          | Starts the game in demo mode.                                              |

```sh
opys launch --feature has_custom_resolution \
  --var resolution_width=1280 --var resolution_height=720
```

## Adding or replacing a library

Every loader takes `libraries`, for a library the game does not ship or a
patched copy of one it does:

```js
forge({
  version: '1.20.1',
  libraries: [
    {
      name: 'com.google.code.gson:gson:2.11.0',
      artifact: {
        path: 'com/google/code/gson/gson/2.11.0/gson-2.11.0.jar',
        source: { file: 'libs/gson-2.11.0.jar' },
      },
    },
  ],
}),
```

| Field             | What it is                                        |
| ----------------- | ------------------------------------------------- |
| `name`            | `group:artifact:version`.                         |
| `artifact.path`   | Where the jar goes inside the `libraries` folder. |
| `artifact.source` | `{ url }`, or `{ file }` next to your config.     |

The rest of `artifact` is an ordinary [artifact](/format/artifacts):
`integrity`, `rules`, `extract`.

- A `file` travels inside the bundle.
- A `url` with no `integrity` is downloaded once while building, to pin its
  hash.
- Your libraries go **first** on the classpath.

**Same name replaces.** One with the same `group:artifact` as a library the
game uses takes its place, on every operating system. The example replaces
the game's Gson.

**Why on every OS:** an override is whole. If you limit yours to one OS
with `rules`, the others get no copy at all. Add an entry per OS.

## Good to know

- Do not list `minecraft()` next to a loader. The loader already includes
  it, and you get a warning per duplicated variable.
- It does not add Java. Add [`java`](./java).
