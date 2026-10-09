# Forge

The `forge` plugin, from `@opys/minecraft`.

Forge, for any Minecraft version from 1.1 on.

<!-- prettier-ignore -->
```js{4,8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    forge({ version: '1.20.1' }),
    java({ version: '17' }),
  ],
  manifest: {
    command: '@forge.command',
    args: [
      '@forge.jvmArgs',
      '@forge.mainClass',
      '@forge.gameArgs',
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
| `'1.20.1'`             | The recommended build, or the newest if none is recommended. |
| `'1.20.1-latest'`      | The newest build.                                            |
| `'1.20.1-recommended'` | The recommended build.                                       |
| `'1.20.1-47.4.10'`     | Exactly that build.                                          |

The version is resolved **when you build**. `'1.20.1'` today and in six
months can be different builds. For a pack that never moves, write the
exact one.

## What it adds

Everything [Vanilla Minecraft](./minecraft#what-it-adds) adds, with these
differences.

| Kind        | What                                           |
| ----------- | ---------------------------------------------- |
| Files       | Forge's libraries, on top of the game's.       |
| Launch      | `command`, `jvmArgs`, `mainClass`, `gameArgs`. |
| Variables   | The same as [vanilla](./minecraft#variables).  |
| Environment | None.                                          |

Each one below: what it is, and how it ends up in the
[manifest](/format/).

### Files · Forge libraries

Forge's own jars, from Forge's server. A game library Forge replaces is
dropped, not downloaded twice.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    forge({ version: '1.20.1' }),
    java({ version: '17' }),
  ],
  manifest: {
    command: '@forge.command',
    args: [
      '@forge.jvmArgs',
      '@forge.mainClass',
      '@forge.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

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

The vanilla command line, with two changes: the main class is **horno**,
and lines telling it what to install. horno is a small helper that finishes
the loader's install on the player's machine, then starts the game.

<!-- prettier-ignore -->
```js{8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    forge({ version: '1.20.1' }),
    java({ version: '17' }),
  ],
  manifest: {
    command: '@forge.command',
    args: [
      '@forge.jvmArgs',
      '@forge.mainClass',
      '@forge.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

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

| You write            | Becomes                                                       |
| -------------------- | ------------------------------------------------------------- |
| `'@forge.command'`   | The program to run: whatever Java the pack has.               |
| `'@forge.jvmArgs'`   | Arguments for Java itself, ending with the classpath.         |
| `'@forge.mainClass'` | The class to start. One argument.                             |
| `'@forge.gameArgs'`  | Arguments for the game: who is playing, and where things are. |

### Variables

The same names as vanilla. `classpath` now has this loader's libraries
ahead of the game's.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    forge({ version: '1.20.1' }),
    java({ version: '17' }),
  ],
  manifest: {
    command: '@forge.command',
    args: [
      '@forge.jvmArgs',
      '@forge.mainClass',
      '@forge.gameArgs',
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

- Forge 1.7.2 needs Java 7: `java({ version: '7', vendor: 'zulu' })`.
- Forge 1.16.4 needs a Java 8 no newer than 8u312:
  `java({ version: '8u312-b07' })`.
- Ten early 1.5 betas (such as `1.5-7.7.0.559`) cannot be installed. A file
  they need no longer exists. `'1.5'` picks a later build.
- Pair it with [`java({ version: '17' })`](./java#which-java-for-which-minecraft).
