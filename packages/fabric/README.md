# @opys/fabric

[![npm](https://img.shields.io/npm/v/@opys/fabric.svg)](https://www.npmjs.com/package/@opys/fabric)

Fabric for opys. `fabric()` adds the game and a Fabric loader, for any
Minecraft version Fabric supports. Use it instead of `minecraft()`.

```sh
npm install -D @opys/dev @opys/fabric @opys/java
```

## Example

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { fabric } from '@opys/fabric';
import { java } from '@opys/java';

export default defineConfig({
  output: 'game.opys',
  plugins: [fabric({ version: '1.21.4' }), java({ version: '21' })],
  manifest: {
    command: '@fabric.command',
    args: ['@fabric.jvmArgs', '@fabric.mainClass', '@fabric.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Options

| Option         | What it does                                                           |
| -------------- | ---------------------------------------------------------------------- |
| `version`      | A Minecraft version: `'1.21.4'`.                                       |
| `loader`       | A Fabric loader version: `'0.16.10'`. Left out: the newest stable one. |
| `source`       | A mirror of Fabric Meta.                                               |
| `manifestBase` | A mirror of Mojang's version list.                                     |
| `libraries`    | Libraries to add or replace, each `{ name, artifact }`.                |

Without `loader` the newest stable one is used, so it can change between two
builds. Pin it for a pack that never moves.

## What it adds

Everything [`@opys/minecraft-vanilla`](https://www.npmjs.com/package/@opys/minecraft-vanilla#what-it-adds)
adds (the game, its variables), with these differences.

### Files · Fabric libraries

The Fabric loader and what it needs.

<!-- prettier-ignore -->
```jsonc
// in the manifest
{
  "path": "${library_directory}/net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar",
  "source": { "url": "https://maven.fabricmc.net/net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar" }
}
```

### Launch

The vanilla command line with Fabric's main class. Nothing runs before the
game: Fabric has no install step.

<!-- prettier-ignore -->
```jsonc
// in the manifest
"launch": {
  // '@fabric.command'
  "command": "${java_bin}",
  "args": [
    // '@fabric.jvmArgs'
    // … the vanilla JVM arguments, then:
    "-cp",
    "${classpath}",
    "-DFabricMcEmu= net.minecraft.client.main.Main ",
    // '@fabric.mainClass'
    "net.fabricmc.loader.impl.launch.knot.KnotClient",
    // '@fabric.gameArgs'
    "--username", "${auth_player_name}",
    "--version", "${version_name}"
    // … the vanilla game arguments, and none of Fabric's own
  ],
  "workdir": "${game_directory}"
}
```

### Variables

The same names as vanilla. `classpath` has the loader's libraries ahead of
the game's.

<!-- prettier-ignore -->
```jsonc
// in the manifest
"vars": {
  "classpath": [/* the loader's libraries, the game's, then the game jar */]
  // … the rest, as in vanilla
}
```

## Every option

Each option, in each way it is used.

```js
// the newest stable Fabric loader for a Minecraft version
fabric({ version: '1.21.4' });

// a pinned loader: the same in every build of the pack
fabric({ version: '1.21.4', loader: '0.16.10' });

// a library the game does not ship, or a patched copy of one it does
fabric({
  version: '1.21.4',
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

// mirrors, for a network that cannot reach the defaults
fabric({
  version: '1.21.4',
  source: 'https://mirror.example.com/fabric-meta',
  manifestBase: 'https://mirror.example.com/mc/game/version_manifest_v2.json',
});
```

## Documentation

- [The full page](https://harmoniya-net.github.io/opys/plugins/fabric): every option, and why it works this way
- [The format](https://harmoniya-net.github.io/opys/format/): what a manifest is made of

Part of [opys](https://github.com/harmoniya-net/opys). Also exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
