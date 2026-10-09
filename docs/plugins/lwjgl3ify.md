# lwjgl3ify

The `lwjgl3ify` plugin, from `@opys/minecraft`.

[lwjgl3ify](https://github.com/GTNewHorizons/lwjgl3ify): Forge 1.7.10 mods on a modern Java.

<!-- prettier-ignore -->
```js{4,8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    lwjgl3ify({ version: '1.7.10' }),
    java({ version: '25' }),
  ],
  manifest: {
    command: '@lwjgl3ify.command',
    args: [
      '@lwjgl3ify.jvmArgs',
      '@lwjgl3ify.mainClass',
      '@lwjgl3ify.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

Use it **instead of** `minecraft`. A loader brings the game with it.

## Options

| Option      | What it does                                                              |
| ----------- | ------------------------------------------------------------------------- |
| `version`   | Which build. See below.                                                   |
| `source`    | A mirror of the build index.                                              |
| `unimixins` | `false` to leave UniMixins out, or `{ version, repo }` to pick another.   |
| `repo`      | The GitHub repository the mod jar comes from.                             |
| `token`     | A GitHub token, for the rate limit.                                       |
| `apiBase`   | A GitHub API mirror.                                                      |
| `libraries` | Libraries to [add or replace](./minecraft#adding-or-replacing-a-library). |

### version

| You write              | You get                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `'1.7.10'`             | The recommended release, or the newest if none is recommended. |
| `'1.7.10-latest'`      | The newest release.                                            |
| `'1.7.10-recommended'` | The recommended release.                                       |
| `'3.0.37'`             | Exactly that release.                                          |

The version is resolved **when you build**. `'1.7.10'` today and in six
months can be different releases. For a pack that never moves, write the
exact one.

## What it adds

Everything [Vanilla Minecraft](./minecraft#what-it-adds) adds, with these
differences.

| Kind        | What                                                          |
| ----------- | ------------------------------------------------------------- |
| Files       | The 1.7.10 game with lwjgl3ify's libraries, and **two mods**. |
| Launch      | `command`, `jvmArgs`, `mainClass`, `gameArgs`.                |
| Variables   | The same as [vanilla](./minecraft#variables).                 |
| Environment | None.                                                         |

Each one below: what it is, and how it ends up in the
[manifest](/format/).

### Files · two mods in `mods/`

The lwjgl3ify mod, and UniMixins, which it cannot start without. Both come
from GitHub releases, pinned by sha256.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    lwjgl3ify({ version: '1.7.10' }),
    java({ version: '25' }),
  ],
  manifest: {
    command: '@lwjgl3ify.command',
    args: [
      '@lwjgl3ify.jvmArgs',
      '@lwjgl3ify.mainClass',
      '@lwjgl3ify.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

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

A long one. A 2014 game on a modern Java needs many doors opened by hand.

<!-- prettier-ignore -->
```js{8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    lwjgl3ify({ version: '1.7.10' }),
    java({ version: '25' }),
  ],
  manifest: {
    command: '@lwjgl3ify.command',
    args: [
      '@lwjgl3ify.jvmArgs',
      '@lwjgl3ify.mainClass',
      '@lwjgl3ify.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

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

| You write                | Becomes                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `'@lwjgl3ify.command'`   | The program to run: whatever Java the pack has.               |
| `'@lwjgl3ify.jvmArgs'`   | Arguments for Java itself, ending with the classpath.         |
| `'@lwjgl3ify.mainClass'` | The class to start. One argument.                             |
| `'@lwjgl3ify.gameArgs'`  | Arguments for the game: who is playing, and where things are. |

### Variables

The same names as vanilla. `classpath` now has this loader's libraries
ahead of the game's.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    lwjgl3ify({ version: '1.7.10' }),
    java({ version: '25' }),
  ],
  manifest: {
    command: '@lwjgl3ify.command',
    args: [
      '@lwjgl3ify.jvmArgs',
      '@lwjgl3ify.mainClass',
      '@lwjgl3ify.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// in the manifest
"vars": {
  "game_directory": "${root}/",
  "library_directory": "${root}/libraries",
  // … the rest, as in vanilla
}
```

**Why the mods are added for you:** forgetting either gives a game that
does not start, with an error that does not say why.

## Good to know

- It replaces both `minecraft` and `forge`.
- Pass `unimixins: false` only if your pack ships its own mixin runtime.
- Both mods come from GitHub. Pass `token` if a build hits the rate limit.
- Pair it with [`java({ version: '25' })`](./java#which-java-for-which-minecraft).
