# @opys/forge

[![npm](https://img.shields.io/npm/v/@opys/forge.svg)](https://www.npmjs.com/package/@opys/forge)

Forge for opys. `forge()` adds the game and a Forge build, for any Minecraft
version from 1.1 on. Use it instead of `minecraft()`.

```sh
npm install -D @opys/dev @opys/forge @opys/java
```

## Example

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { forge } from '@opys/forge';
import { java } from '@opys/java';

export default defineConfig({
  output: 'game.opys',
  plugins: [forge({ version: '1.20.1' }), java({ version: '17' })],
  manifest: {
    command: '@forge.command',
    args: ['@forge.jvmArgs', '@forge.mainClass', '@forge.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Options

| Option         | What it does                                                                       |
| -------------- | ---------------------------------------------------------------------------------- |
| `version`      | `'1.20.1'` (recommended build), `'1.20.1-latest'`, or an exact `'1.20.1-47.4.10'`. |
| `source`       | A mirror of the build index.                                                       |
| `manifestBase` | A mirror of Mojang's version list.                                                 |
| `libraries`    | Libraries to add or replace, each `{ name, artifact }`.                            |

`version` is resolved when you build, so anything but an exact build can
change between two builds.

## What it adds

Everything [`@opys/minecraft-vanilla`](https://www.npmjs.com/package/@opys/minecraft-vanilla#what-it-adds)
adds (the game, its variables), with these differences.

### Files · Forge libraries

Forge's own jars. A game library Forge replaces is dropped.

<!-- prettier-ignore -->
```jsonc
// in the manifest
{
  "path": "${library_directory}/cpw/mods/modlauncher/10.0.9/modlauncher-10.0.9.jar",
  "source": { "url": "https://maven.minecraftforge.net/cpw/mods/modlauncher/10.0.9/modlauncher-10.0.9.jar" },
  "size": 130343,
  "integrity": { "sha1": "06d9443f56f50bb85cea383686ff9c867391458b" }
}
```

### Launch

The vanilla command line, started through **horno**: a small helper that
finishes the loader's install on the player's machine, then starts the game.

<!-- prettier-ignore -->
```jsonc
// in the manifest
"launch": {
  // '@forge.command'
  "command": "${java_bin}",
  "args": [
    // '@forge.jvmArgs'
    // … the vanilla JVM arguments, then:
    "-cp",
    "${classpath}",
    "-Dhorno.librariesDir=${library_directory}",
    "-Dhorno.installer=${library_directory}/net/minecraftforge/forge/1.20.1-47.4.10/forge-1.20.1-47.4.10-installer.jar",
    "-Dhorno.installerUrl=https://maven.minecraftforge.net/…/forge-1.20.1-47.4.10-installer.jar",
    "-Dhorno.installerSha1=66bfea9963bfa60d88bab6b2750e74a958392715",
    "-Dhorno.minecraft=${library_directory}/com/mojang/minecraft/1.20.1/minecraft-1.20.1-client.jar",
    // '@forge.mainClass'
    "net.harmoniya.horno.Main",
    // '@forge.gameArgs'
    "--username", "${auth_player_name}",
    // … the vanilla game arguments, then:
    "--launchTarget", "forgeclient",
    "--fml.forgeVersion", "47.4.10",
    "--fml.mcVersion", "1.20.1"
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
forge({ version: '1.20.1' });
forge({ version: '1.20.1-recommended' });

// the newest build
forge({ version: '1.20.1-latest' });

// one exact build: the same in every build of the pack
forge({ version: '1.20.1-47.4.10' });

// a library the game does not ship, or a patched copy of one it does
forge({
  version: '1.20.1',
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
forge({
  version: '1.20.1',
  source: 'https://mirror.example.com/forge',
  manifestBase: 'https://mirror.example.com/mc/game/version_manifest_v2.json',
});
```

## Documentation

- [The full page](https://harmoniya-net.github.io/opys/plugins/forge): every option, and why it works this way
- [The format](https://harmoniya-net.github.io/opys/format/): what a manifest is made of

Part of [opys](https://github.com/harmoniya-net/opys). Also exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
