# Plugins

A plugin adds one part of a pack. This section has a page per plugin, and
each page answers the same question: **what does it add, and why?**

## What a plugin can add

| Kind              | Is                                         | Used as                       |
| ----------------- | ------------------------------------------ | ----------------------------- |
| **Files**         | [Artifacts](/format/artifacts) to install. | They just get installed.      |
| **Variables**     | [Named values](/format/variables).         | `${java_home}` anywhere.      |
| **Launch pieces** | Named parts of the command line.           | `'@forge.jvmArgs'` in `args`. |
| **Environment**   | Environment variables for the game.        | Set automatically.            |

Nothing else. A plugin runs only while you build, and none of it reaches the
player's machine.

## Any pack

|                          | Plugin  | Does                                                |
| ------------------------ | ------- | --------------------------------------------------- |
| [Local files](./files)   | `files` | Installs a folder from your disk.                   |
| [Files by link](./links) | `links` | Installs a file you have a URL for, pinned by hash. |

Both take a `to` function that says where each file is installed:

```js
to: (file) => '${game_directory}/mods/' + file.filename,
```

## Minecraft

|                                     | Plugin           | Does                                        |
| ----------------------------------- | ---------------- | ------------------------------------------- |
| [Vanilla Minecraft](./minecraft)    | `minecraft`      | The game as Mojang ships it.                |
| [Server list](./serverlist)         | `serverlist`     | Pre-fills the multiplayer server list.      |
| [A server](./server)                | `server`         | A Minecraft server, whichever kind.         |
| [Custom auth server](./authliberty) | `authliberty`    | Points the game at your own account server. |
| [Bifrost](./bifrost)                | `resolveBifrost` | Makes a player's login token at launch.     |

## Minecraft mod loaders

Use one **instead of** `minecraft`. Each loader includes the game.

|                          | Plugin      | Does                                 |
| ------------------------ | ----------- | ------------------------------------ |
| [Forge](./forge)         | `forge`     | Forge mods, Minecraft 1.1 and later. |
| [NeoForge](./neoforge)   | `neoforge`  | NeoForge mods, 1.20.2 and later.     |
| [Fabric](./fabric)       | `fabric`    | Fabric mods.                         |
| [Cleanroom](./cleanroom) | `cleanroom` | Forge 1.12.2 mods on a modern Java.  |
| [lwjgl3ify](./lwjgl3ify) | `lwjgl3ify` | Forge 1.7.10 mods on a modern Java.  |

## Minecraft mod resources

|                            | Plugin       | Does                                                   |
| -------------------------- | ------------ | ------------------------------------------------------ |
| [Modrinth](./modrinth)     | `modrinth`   | Mods and modpacks from Modrinth. No key needed.        |
| [CurseForge](./curseforge) | `curseforge` | Mods and modpacks from CurseForge. Needs an API token. |

## Java

|                         | Plugin  | Does                                        |
| ----------------------- | ------- | ------------------------------------------- |
| [Java runtime](./java)  | `java`  | The Java that runs the game.                |
| [Discrete GPU](./dgpuj) | `dgpuj` | Starts that Java on the fast graphics card. |

## Where they come from

Everything is exported by `@opys/minecraft`, except `files`, which is in
`@opys/dev`.

Need something that is not here? [Write a plugin](./writing-a-plugin). It
is one function.
