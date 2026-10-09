# @opys/lwjgl3ify

[![npm](https://img.shields.io/npm/v/@opys/lwjgl3ify.svg)](https://www.npmjs.com/package/@opys/lwjgl3ify)

lwjgl3ify for opys. `lwjgl3ify()` adds Minecraft 1.7.10 with
[lwjgl3ify](https://github.com/GTNewHorizons/lwjgl3ify): Forge 1.7.10 mods on
a modern Java. Use it instead of `minecraft()`.

```sh
npm install -D @opys/dev @opys/lwjgl3ify @opys/java
```

## Example

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { java } from '@opys/java';
import { lwjgl3ify } from '@opys/lwjgl3ify';

export default defineConfig({
  output: 'game.opys',
  plugins: [lwjgl3ify({ version: '1.7.10' }), java({ version: '25' })],
  manifest: {
    command: '@lwjgl3ify.command',
    args: ['@lwjgl3ify.jvmArgs', '@lwjgl3ify.mainClass', '@lwjgl3ify.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Options

| Option                     | What it does                                                                 |
| -------------------------- | ---------------------------------------------------------------------------- |
| `version`                  | `'1.7.10'` (recommended release), `'1.7.10-latest'`, or an exact `'3.0.37'`. |
| `unimixins`                | `false` to leave UniMixins out, or `{ version, repo }` to pick another.      |
| `source`                   | A mirror of the build index.                                                 |
| `repo`, `token`, `apiBase` | Where the mod jar comes from on GitHub, and a token for the rate limit.      |
| `libraries`                | Libraries to add or replace, each `{ name, artifact }`.                      |

`version` is resolved when you build, so anything but an exact build can
change between two builds.

## What it adds

Everything [`@opys/minecraft-vanilla`](https://www.npmjs.com/package/@opys/minecraft-vanilla#what-it-adds)
adds (the game, its variables), with these differences.

### Files · two mods in `mods/`

Besides the libraries: the lwjgl3ify mod, and UniMixins, which it cannot
start without.

<!-- prettier-ignore -->
```jsonc
// in the manifest
{
  "path": "${game_directory}/mods/lwjgl3ify-3.0.37.jar",
  "source": { "url": "https://github.com/GTNewHorizons/lwjgl3ify/releases/download/3.0.37/lwjgl3ify-3.0.37.jar" },
  "size": 8266971,
  "integrity": { "sha256": "3c5af555d62eb9b7f4196adea94cb4cbd4c8efe3e1d512f83537aa88d9d5211e" }
},
{
  "path": "${game_directory}/mods/+unimixins-all-1.7.10-0.3.2.jar",
  "source": { "url": "https://github.com/LegacyModdingMC/UniMixins/releases/download/0.3.2/%2Bunimixins-all-1.7.10-0.3.2.jar" },
  "size": 5520080,
  "integrity": { "sha256": "2687b776c8503e0b60cd8413cf70eaabb836c19f9fc726280ef61d6612257034" }
}
```

### Launch

A long line. A 2014 game on a modern Java needs many doors opened by hand.

<!-- prettier-ignore -->
```jsonc
// in the manifest
"launch": {
  // '@lwjgl3ify.command'
  "command": "${java_bin}",
  "args": [
    // '@lwjgl3ify.jvmArgs'
    "-Djava.library.path=${natives_directory}",
    "-cp",
    "${classpath}",
    "-Djava.system.class.loader=com.gtnewhorizons.retrofuturabootstrap.RfbSystemClassLoader",
    "--add-opens", "java.base/java.io=ALL-UNNAMED",
    "--add-opens", "java.base/java.lang=ALL-UNNAMED"
    // … about forty more --add-opens
    // '@lwjgl3ify.mainClass'
    "com.gtnewhorizons.retrofuturabootstrap.MainStartOnFirstThread",
    // '@lwjgl3ify.gameArgs'
    "--username", "${auth_player_name}",
    // … the rest of the 1.7.10 game arguments, then:
    "--tweakClass", "cpw.mods.fml.common.launcher.FMLTweaker"
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
lwjgl3ify({ version: '1.7.10' });
lwjgl3ify({ version: '1.7.10-recommended' });

// the newest release
lwjgl3ify({ version: '1.7.10-latest' });

// one exact release: the same in every build of the pack
lwjgl3ify({ version: '3.0.37' });

// a library the game does not ship, or a patched copy of one it does
lwjgl3ify({
  version: '1.7.10',
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
lwjgl3ify({
  version: '1.7.10',
  source: 'https://mirror.example.com/lwjgl3ify',
});

// another UniMixins, or none at all
lwjgl3ify({ version: '1.7.10', unimixins: { version: '0.3.2' } });
lwjgl3ify({ version: '1.7.10', unimixins: { repo: 'my-org/UniMixins' } });
lwjgl3ify({ version: '1.7.10', unimixins: false });

// the mod jar from a fork, with a GitHub token for the rate limit
lwjgl3ify({
  version: '1.7.10',
  repo: 'my-org/lwjgl3ify',
  token: process.env.GITHUB_TOKEN,
  apiBase: 'https://github.example.com/api/v3',
});
```

## Documentation

- [The full page](https://harmoniya-net.github.io/opys/plugins/lwjgl3ify): every option, and why it works this way
- [The format](https://harmoniya-net.github.io/opys/format/): what a manifest is made of

Part of [opys](https://github.com/harmoniya-net/opys). Also exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
