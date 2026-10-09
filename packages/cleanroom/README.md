# @opys/cleanroom

[![npm](https://img.shields.io/npm/v/@opys/cleanroom.svg)](https://www.npmjs.com/package/@opys/cleanroom)

Cleanroom for opys. `cleanroom()` adds Minecraft 1.12.2 with
[Cleanroom](https://github.com/CleanroomMC/Cleanroom): Forge 1.12.2 mods on a
modern Java. Use it instead of `minecraft()`.

```sh
npm install -D @opys/dev @opys/cleanroom @opys/java
```

## Example

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { cleanroom } from '@opys/cleanroom';
import { java } from '@opys/java';

export default defineConfig({
  output: 'game.opys',
  plugins: [cleanroom({ version: '1.12.2' }), java({ version: '25' })],
  manifest: {
    command: '@cleanroom.command',
    args: ['@cleanroom.jvmArgs', '@cleanroom.mainClass', '@cleanroom.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Options

| Option      | What it does                                                                       |
| ----------- | ---------------------------------------------------------------------------------- |
| `version`   | `'1.12.2'` (recommended release), `'1.12.2-latest'`, or an exact `'0.6.13-alpha'`. |
| `source`    | A mirror of the build index.                                                       |
| `libraries` | Libraries to add or replace, each `{ name, artifact }`.                            |

`version` is resolved when you build, so anything but an exact build can
change between two builds.

## What it adds

Everything [`@opys/minecraft-vanilla`](https://www.npmjs.com/package/@opys/minecraft-vanilla#what-it-adds)
adds (the game, its variables), with these differences.

### Files · the game and Cleanroom libraries

The 1.12.2 game, with LWJGL 2 swapped for LWJGL 3. The old one is not
installed at all.

<!-- prettier-ignore -->
```jsonc
// in the manifest
{
  "path": "${library_directory}/com/cleanroommc/cleanroom/0.6.13-alpha/cleanroom-0.6.13-alpha.jar",
  "source": { "url": "https://github.com/CleanroomMC/Cleanroom/releases/download/0.6.13-alpha/cleanroom-0.6.13-alpha-universal.jar" },
  "size": 6505649,
  "integrity": { "sha1": "8d59eda7065f26fc0c1bbd3a9fa9f272ff89917f" }
}
```

### Launch

A short line, started through Cleanroom's own main class. Nothing runs before
the game.

<!-- prettier-ignore -->
```jsonc
// in the manifest
"launch": {
  // '@cleanroom.command'
  "command": "${java_bin}",
  "args": [
    // '@cleanroom.jvmArgs'
    "-Djava.library.path=${natives_directory}",
    "-cp",
    "${classpath}",
    // '@cleanroom.mainClass'
    "top.outlands.foundation.boot.Foundation",
    // '@cleanroom.gameArgs'
    "--username", "${auth_player_name}",
    // … the rest of the 1.12.2 game arguments, then:
    "--tweakClass", "net.minecraftforge.fml.common.launcher.FMLTweaker",
    "--versionType", "Forge"
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
// the recommended release for a Minecraft version, or the newest if none is
cleanroom({ version: '1.12.2' });
cleanroom({ version: '1.12.2-recommended' });

// the newest release
cleanroom({ version: '1.12.2-latest' });

// one exact release: the same in every build of the pack
cleanroom({ version: '0.6.13-alpha' });

// a library the game does not ship, or a patched copy of one it does
cleanroom({
  version: '1.12.2',
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
cleanroom({
  version: '1.12.2',
  source: 'https://mirror.example.com/cleanroom',
});
```

## Documentation

- [The full page](https://harmoniya-net.github.io/opys/plugins/cleanroom): every option, and why it works this way
- [The format](https://harmoniya-net.github.io/opys/format/): what a manifest is made of

Part of [opys](https://github.com/harmoniya-net/opys). Also exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
