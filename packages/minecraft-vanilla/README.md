# @opys/minecraft-vanilla

[![npm](https://img.shields.io/npm/v/@opys/minecraft-vanilla.svg)](https://www.npmjs.com/package/@opys/minecraft-vanilla)

Vanilla Minecraft for opys. `minecraft()` adds the game as Mojang ships it,
with no mod loader.

```sh
npm install -D @opys/dev @opys/minecraft-vanilla @opys/java
```

## Example

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { java } from '@opys/java';
import { minecraft } from '@opys/minecraft-vanilla';

export default defineConfig({
  output: 'game.opys',
  plugins: [minecraft({ version: '1.21.1' }), java({ version: '21' })],
  manifest: {
    command: '@minecraft.command',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Options

| Option         | What it does                                            |
| -------------- | ------------------------------------------------------- |
| `version`      | A Minecraft version. Left out: the current release.     |
| `libraries`    | Libraries to add or replace, each `{ name, artifact }`. |
| `manifestBase` | A mirror of Mojang's version list.                      |

## What it adds

`opys build` turns the plugin into these parts of the manifest.

### Files · the game jar

One file, pinned by the hash Mojang publishes.

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

About a hundred jars. One with native code has `rules` and is unpacked.

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

Sounds, textures, languages: a few thousand small files.

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

The whole command line, as four pieces you put in order.

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
    { "rules": "allow.features.is_demo_user", "value": ["--demo"] }
  ],
  "workdir": "${game_directory}"
}
```

### Variables

Folders, all under `root`, and the names the game expects for the player.

<!-- prettier-ignore -->
```jsonc
// in the manifest
"vars": {
  "root": ".",
  "game_directory": "${root}/",                       // saves, mods, options
  "library_directory": "${root}/libraries",
  "assets_root": "${root}/assets",
  "version_dir": "${root}/versions/${version_name}",  // the game jar
  "natives_directory": "${version_dir}/natives",

  "auth_player_name": "${username}",
  "auth_uuid": "${uuid}",
  "auth_access_token": "${token}",

  "version_name": "1.21.1",
  "classpath": [/* every library, then the game jar, per OS */]
  // … and a few more the game's arguments refer to
}
```

`root`, `username`, `uuid` and `token` are left open: they differ per player.
Set them in `run`, with `--var`, or from a launcher.

## Every option

Each option, in each way it is used.

```js
// one version
minecraft({ version: '1.21.1' });

// whatever the current release is on the day you build
minecraft();

// a library the game does not ship, or a patched copy of one it does
minecraft({
  version: '1.21.1',
  libraries: [
    // a jar next to the config: it travels inside the bundle
    {
      name: 'com.google.code.gson:gson:2.11.0',
      artifact: {
        path: 'com/google/code/gson/gson/2.11.0/gson-2.11.0.jar',
        source: { file: 'libs/gson-2.11.0.jar' },
      },
    },
    // a jar by link, for one OS only
    {
      name: 'com.example:native-helper:1.0',
      artifact: {
        path: 'com/example/native-helper/1.0/native-helper-1.0.jar',
        source: { url: 'https://example.com/native-helper-1.0.jar' },
        integrity: { sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709' },
        rules: 'allow.os.windows',
      },
    },
  ],
});

// a mirror of Mojang's version list
minecraft({
  version: '1.21.1',
  manifestBase: 'https://mirror.example.com/mc/game/version_manifest_v2.json',
});
```

## Documentation

- [The full page](https://harmoniya-net.github.io/opys/plugins/minecraft): every option, and why it works this way
- [The format](https://harmoniya-net.github.io/opys/format/): what a manifest is made of

Part of [opys](https://github.com/harmoniya-net/opys). Also exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
