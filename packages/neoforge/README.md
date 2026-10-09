# @opys/neoforge

[![npm](https://img.shields.io/npm/v/@opys/neoforge.svg)](https://www.npmjs.com/package/@opys/neoforge)

NeoForge for opys. `neoforge()` adds the game and a NeoForge build, for
Minecraft 1.20.2 and later. Use it instead of `minecraft()`.

```sh
npm install -D @opys/dev @opys/neoforge @opys/java
```

## Example

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { java } from '@opys/java';
import { neoforge } from '@opys/neoforge';

export default defineConfig({
  output: 'game.opys',
  plugins: [neoforge({ version: '1.21.1' }), java({ version: '21' })],
  manifest: {
    command: '@neoforge.command',
    args: ['@neoforge.jvmArgs', '@neoforge.mainClass', '@neoforge.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Options

| Option         | What it does                                                                 |
| -------------- | ---------------------------------------------------------------------------- |
| `version`      | `'1.21.1'` (recommended build), `'1.21.1-latest'`, or an exact `'21.1.172'`. |
| `source`       | A mirror of the build index.                                                 |
| `manifestBase` | A mirror of Mojang's version list.                                           |
| `libraries`    | Libraries to add or replace, each `{ name, artifact }`.                      |

`version` is resolved when you build, so anything but an exact build can
change between two builds.

## What it adds

Everything [`@opys/minecraft-vanilla`](https://www.npmjs.com/package/@opys/minecraft-vanilla#what-it-adds)
adds (the game, its variables), with these differences.

### Files · NeoForge libraries

NeoForge's own jars.

<!-- prettier-ignore -->
```jsonc
// in the manifest
{
  "path": "${library_directory}/cpw/mods/modlauncher/11.0.5/modlauncher-11.0.5.jar",
  "source": { "url": "https://maven.neoforged.net/releases/cpw/mods/modlauncher/11.0.5/modlauncher-11.0.5.jar" },
  "size": 116486,
  "integrity": { "sha1": "b8f0d49294f733fdb6173931b263553e943dc950" }
}
```

### Launch

The vanilla command line, started through **horno**: a small helper that
finishes the loader's install on the player's machine, then starts the game.

<!-- prettier-ignore -->
```jsonc
// in the manifest
"launch": {
  // '@neoforge.command'
  "command": "${java_bin}",
  "args": [
    // '@neoforge.jvmArgs'
    // … the vanilla JVM arguments, then:
    "-cp",
    "${classpath}",
    "-Dhorno.librariesDir=${library_directory}",
    "-Dhorno.installer=${library_directory}/net/neoforged/neoforge/21.1.256/neoforge-21.1.256-installer.jar",
    "-Dhorno.installerUrl=https://maven.neoforged.net/releases/…/neoforge-21.1.256-installer.jar",
    "-Dhorno.installerSha1=9d85f6e652996e83f05ead32120317e1ef056590",
    "-Dhorno.minecraft=${library_directory}/com/mojang/minecraft/1.21.1/minecraft-1.21.1-client.jar",
    // '@neoforge.mainClass'
    "net.harmoniya.horno.Main",
    // '@neoforge.gameArgs'
    "--username", "${auth_player_name}",
    // … the vanilla game arguments, then:
    "--fml.neoForgeVersion", "21.1.256",
    "--fml.mcVersion", "1.21.1",
    "--launchTarget", "forgeclient"
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

The first launch is slower, because horno does its work then. `opys install`
does it ahead of time.

## Every option

Each option, in each way it is used.

```js
// the recommended build for a Minecraft version, or the newest if none is
neoforge({ version: '1.21.1' });
neoforge({ version: '1.21.1-recommended' });

// the newest build
neoforge({ version: '1.21.1-latest' });

// one exact build: the same in every build of the pack
neoforge({ version: '21.1.172' });

// a library the game does not ship, or a patched copy of one it does
neoforge({
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

// mirrors, for a network that cannot reach the defaults
neoforge({
  version: '1.21.1',
  source: 'https://mirror.example.com/neoforge',
  manifestBase: 'https://mirror.example.com/mc/game/version_manifest_v2.json',
});
```

## Documentation

- [The full page](https://harmoniya-net.github.io/opys/plugins/neoforge): every option, and why it works this way
- [The format](https://harmoniya-net.github.io/opys/format/): what a manifest is made of

Part of [opys](https://github.com/harmoniya-net/opys). Also exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
