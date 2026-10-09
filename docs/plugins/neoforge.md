# NeoForge

The `neoforge` plugin, from `@opys/minecraft`.

NeoForge, for Minecraft 1.20.2 and later.

<!-- prettier-ignore -->
```js{4,8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    neoforge({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@neoforge.command',
    args: [
      '@neoforge.jvmArgs',
      '@neoforge.mainClass',
      '@neoforge.gameArgs',
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
| `source`       | A mirror of the build index.                                              |
| `manifestBase` | A mirror of Mojang's version list.                                        |
| `libraries`    | Libraries to [add or replace](./minecraft#adding-or-replacing-a-library). |

### version

| You write              | You get                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `'1.21.1'`             | The recommended build, or the newest if none is recommended. |
| `'1.21.1-latest'`      | The newest build.                                            |
| `'1.21.1-recommended'` | The recommended build.                                       |
| `'21.1.172'`           | Exactly that build.                                          |

The version is resolved **when you build**. `'1.21.1'` today and in six
months can be different builds. For a pack that never moves, write the
exact one.

## What it adds

Everything [Vanilla Minecraft](./minecraft#what-it-adds) adds, with these
differences.

| Kind        | What                                           |
| ----------- | ---------------------------------------------- |
| Files       | NeoForge's libraries, on top of the game's.    |
| Launch      | `command`, `jvmArgs`, `mainClass`, `gameArgs`. |
| Variables   | The same as [vanilla](./minecraft#variables).  |
| Environment | None.                                          |

Each one below: what it is, and how it ends up in the
[manifest](/format/).

### Files · NeoForge libraries

NeoForge's own jars, from NeoForge's server.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    neoforge({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@neoforge.command',
    args: [
      '@neoforge.jvmArgs',
      '@neoforge.mainClass',
      '@neoforge.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

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

The vanilla command line, with two changes: the main class is **horno**,
and lines telling it what to install. horno is a small helper that finishes
the loader's install on the player's machine, then starts the game.

<!-- prettier-ignore -->
```js{8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    neoforge({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@neoforge.command',
    args: [
      '@neoforge.jvmArgs',
      '@neoforge.mainClass',
      '@neoforge.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

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

| You write               | Becomes                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `'@neoforge.command'`   | The program to run: whatever Java the pack has.               |
| `'@neoforge.jvmArgs'`   | Arguments for Java itself, ending with the classpath.         |
| `'@neoforge.mainClass'` | The class to start. One argument.                             |
| `'@neoforge.gameArgs'`  | Arguments for the game: who is playing, and where things are. |

### Variables

The same names as vanilla. `classpath` now has this loader's libraries
ahead of the game's.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    neoforge({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@neoforge.command',
    args: [
      '@neoforge.jvmArgs',
      '@neoforge.mainClass',
      '@neoforge.gameArgs',
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

**Why the first launch is slower:** horno does its work then. Nothing to
configure. `opys install` does it ahead of time.

## Good to know

- A build with a qualifier such as `-beta` is never "recommended".
- Java: 17 for 1.20.2 to 1.20.4, 21 for 1.20.5 to 1.21.x, 25 for 26.x.
- Pair it with [`java({ version: '21' })`](./java#which-java-for-which-minecraft).
