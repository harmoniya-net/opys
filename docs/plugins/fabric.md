# Fabric

The `fabric` plugin, from `@opys/minecraft`.

Fabric, for any Minecraft version Fabric supports.

<!-- prettier-ignore -->
```js{4,8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    fabric({ version: '1.21.4' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@fabric.command',
    args: [
      '@fabric.jvmArgs',
      '@fabric.mainClass',
      '@fabric.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

Use it **instead of** `minecraft`. A loader brings the game with it.

## Options

| Option         | What it does                                                              |
| -------------- | ------------------------------------------------------------------------- |
| `version`      | Which build. See below.                                                   |
| `loader`       | A Fabric loader version. Left out: the newest stable one.                 |
| `source`       | A mirror of Fabric Meta.                                                  |
| `manifestBase` | A mirror of Mojang's version list.                                        |
| `libraries`    | Libraries to [add or replace](./minecraft#adding-or-replacing-a-library). |

### version

A plain Minecraft version. Fabric has no aliases.

```js
fabric({ version: '1.21.4' }); // the newest stable Fabric loader
fabric({ version: '1.21.4', loader: '0.16.10' }); // a pinned one
```

Without `loader`, the newest stable loader is used, so it can change
between builds. Pin it for a pack that never moves.

## What it adds

Everything [Vanilla Minecraft](./minecraft#what-it-adds) adds, with these
differences.

| Kind        | What                                                       |
| ----------- | ---------------------------------------------------------- |
| Files       | The Fabric loader and its libraries, on top of the game's. |
| Launch      | `command`, `jvmArgs`, `mainClass`, `gameArgs`.             |
| Variables   | The same as [vanilla](./minecraft#variables).              |
| Environment | None.                                                      |

Each one below: what it is, and how it ends up in the
[manifest](/format/).

### Files · Fabric libraries

The Fabric loader and what it needs, from Fabric's server.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    fabric({ version: '1.21.4' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@fabric.command',
    args: [
      '@fabric.jvmArgs',
      '@fabric.mainClass',
      '@fabric.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// in the manifest
{
  "path": "${library_directory}/net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar",
  "source": { "url": "https://maven.fabricmc.net/net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar" }
}
```

### Launch

The vanilla command line with Fabric's main class, and one line telling
Fabric which class the real game is.

<!-- prettier-ignore -->
```js{8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    fabric({ version: '1.21.4' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@fabric.command',
    args: [
      '@fabric.jvmArgs',
      '@fabric.mainClass',
      '@fabric.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

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
    // … the vanilla game arguments
  ],
  "workdir": "${game_directory}"
}
```

| You write             | Becomes                                                       |
| --------------------- | ------------------------------------------------------------- |
| `'@fabric.command'`   | The program to run: whatever Java the pack has.               |
| `'@fabric.jvmArgs'`   | Arguments for Java itself, ending with the classpath.         |
| `'@fabric.mainClass'` | The class to start. One argument.                             |
| `'@fabric.gameArgs'`  | Arguments for the game: who is playing, and where things are. |

### Variables

The same names as vanilla. `classpath` now has this loader's libraries
ahead of the game's.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    fabric({ version: '1.21.4' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@fabric.command',
    args: [
      '@fabric.jvmArgs',
      '@fabric.mainClass',
      '@fabric.gameArgs',
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

Nothing runs on the player's machine before the game. Fabric has no install
step.

## Good to know

- Pair it with [`java({ version: '21' })`](./java#which-java-for-which-minecraft).
