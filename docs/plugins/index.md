# Plugins

A plugin contributes part of a manifest: files, variables, or pieces of the
launch command. This section has one page per plugin, with its options, what
it contributes and an example. For how plugins fit together, see
[Concepts](/guide/concepts).

Every plugin below is exported from `@opys/minecraft`, which re-exports the
individual packages, except `files`, which comes from `@opys/dev`. Install
the individual package instead if you want only one. `bifrost` is the one
entry that is a function and not a plugin.

## The game

The first six each contribute the whole game, vanilla files included, so a
config uses one of them and not two. [`java`](./java) goes beside it.

| Plugin                     | Package                   | What it contributes                                               |
| -------------------------- | ------------------------- | ----------------------------------------------------------------- |
| [`minecraft`](./minecraft) | `@opys/minecraft-vanilla` | The vanilla client, its libraries and assets                      |
| [`forge`](./forge)         | `@opys/forge`             | Forge, for every Minecraft version in its index from 1.1 on       |
| [`neoforge`](./neoforge)   | `@opys/neoforge`          | NeoForge, for every Minecraft version in its index from 1.20.2 on |
| [`fabric`](./fabric)       | `@opys/fabric`            | Fabric, for any Minecraft version Fabric Meta has a loader for    |
| [`cleanroom`](./cleanroom) | `@opys/cleanroom`         | Cleanroom, a successor to Forge for 1.12.2, on a modern Java      |
| [`lwjgl3ify`](./lwjgl3ify) | `@opys/lwjgl3ify`         | lwjgl3ify, Forge 1.7.10 on LWJGL 3 and a modern Java              |
| [`java`](./java)           | `@opys/java`              | A Java runtime for each platform                                  |

## Content

| Plugin                       | Package            | What it contributes                    |
| ---------------------------- | ------------------ | -------------------------------------- |
| [`modrinth`](./modrinth)     | `@opys/modrinth`   | Mods and modpacks from Modrinth        |
| [`curseforge`](./curseforge) | `@opys/curseforge` | Mods and modpacks from CurseForge      |
| [`links`](./link)            | `@opys/link`       | Any published file, from a pasted link |
| [`files`](./files)           | `@opys/dev`        | Files on your disk                     |

## Extras

| Plugin                         | Package                      | What it does                                                       |
| ------------------------------ | ---------------------------- | ------------------------------------------------------------------ |
| [`authliberty`](./authliberty) | `@opys/authliberty`          | Signs players in against your own auth server                      |
| [`bifrost`](./bifrost)         | `@opys/bifrost`              | A function for `runClient`: mints a signed session token at launch |
| [`serverlist`](./serverlist)   | `@opys/minecraft-serverlist` | Pre-fills the multiplayer server list                              |
| [`dgpuj`](./dgpuj)             | `@opys/dgpuj`                | Starts the game on the discrete GPU                                |

## Underneath

These are not plugins. They are the packages plugins and launchers are built
on.

| Package                                          | What it is                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| [`@opys/dev`](./dev)                             | The build SDK: `defineConfig`, the plugin contract, the build engine  |
| [`@opys/core`](./core)                           | The manifest data model and the bundle                                |
| [`@opys/runtime`](./runtime)                     | The installer and launcher                                            |
| [`@opys/mojang`](./mojang)                       | Parsers for Mojang's own formats                                      |
| [`@opys/mojang-rules`](./mojang-rules)           | The types of Mojang's rule format                                     |
| [`@opys/minecraft-vanilla`](./minecraft-vanilla) | The mapping from a version JSON to a manifest, shared by every loader |
