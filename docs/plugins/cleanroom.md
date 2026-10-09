# Cleanroom

The `cleanroom` plugin, from `@opys/minecraft`.

[Cleanroom](https://github.com/CleanroomMC/Cleanroom): Forge 1.12.2 mods on a modern Java.

<!-- prettier-ignore -->
```js{4,8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    cleanroom({ version: '1.12.2' }),
    java({ version: '25' }),
  ],
  manifest: {
    command: '@cleanroom.command',
    args: [
      '@cleanroom.jvmArgs',
      '@cleanroom.mainClass',
      '@cleanroom.gameArgs',
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
| `libraries` | Libraries to [add or replace](./minecraft#adding-or-replacing-a-library). |

### version

| You write              | You get                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `'1.12.2'`             | The recommended release, or the newest if none is recommended. |
| `'1.12.2-latest'`      | The newest release.                                            |
| `'1.12.2-recommended'` | The recommended release.                                       |
| `'0.6.13-alpha'`       | Exactly that release.                                          |

The version is resolved **when you build**. `'1.12.2'` today and in six
months can be different releases. For a pack that never moves, write the
exact one.

## What it adds

Everything [Vanilla Minecraft](./minecraft#what-it-adds) adds, with these
differences.

| Kind        | What                                           |
| ----------- | ---------------------------------------------- |
| Files       | The 1.12.2 game with Cleanroom's libraries.    |
| Launch      | `command`, `jvmArgs`, `mainClass`, `gameArgs`. |
| Variables   | The same as [vanilla](./minecraft#variables).  |
| Environment | None.                                          |

Each one below: what it is, and how it ends up in the
[manifest](/format/).

### Files · the game and Cleanroom libraries

The 1.12.2 game, with the old graphics library (LWJGL 2) swapped for the
current one (LWJGL 3). The old one is not installed at all.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    cleanroom({ version: '1.12.2' }),
    java({ version: '25' }),
  ],
  manifest: {
    command: '@cleanroom.command',
    args: [
      '@cleanroom.jvmArgs',
      '@cleanroom.mainClass',
      '@cleanroom.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

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

A short one. 1.12.2 needs little, and Cleanroom starts through its own
main class.

<!-- prettier-ignore -->
```js{8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    cleanroom({ version: '1.12.2' }),
    java({ version: '25' }),
  ],
  manifest: {
    command: '@cleanroom.command',
    args: [
      '@cleanroom.jvmArgs',
      '@cleanroom.mainClass',
      '@cleanroom.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

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

| You write                | Becomes                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `'@cleanroom.command'`   | The program to run: whatever Java the pack has.               |
| `'@cleanroom.jvmArgs'`   | Arguments for Java itself, ending with the classpath.         |
| `'@cleanroom.mainClass'` | The class to start. One argument.                             |
| `'@cleanroom.gameArgs'`  | Arguments for the game: who is playing, and where things are. |

### Variables

The same names as vanilla. `classpath` now has this loader's libraries
ahead of the game's.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    cleanroom({ version: '1.12.2' }),
    java({ version: '25' }),
  ],
  manifest: {
    command: '@cleanroom.command',
    args: [
      '@cleanroom.jvmArgs',
      '@cleanroom.mainClass',
      '@cleanroom.gameArgs',
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

Nothing runs on the player's machine before the game.

## Good to know

- It replaces both `minecraft` and `forge`.
- Use Java 25 whatever the Minecraft version says. opys does not check.
- Pair it with [`java({ version: '25' })`](./java#which-java-for-which-minecraft).
