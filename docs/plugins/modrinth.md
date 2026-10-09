# Modrinth

The `modrinth` plugin, from `@opys/minecraft`.

Mods from Modrinth, named by version.

```js
modrinth({
  to: (file) => '${game_directory}/mods/' + file.filename,
  versions: [
    'JjCVwmVA', // an ID
    'https://modrinth.com/mod/lithium/version/N08Z8wog', // or the page's URL
  ],
});
```

## Options

| Option     | What it does                       |
| ---------- | ---------------------------------- |
| `versions` | Version IDs, or version page URLs. |
| `to`       | Where each file goes.              |
| `apiBase`  | A mirror of the Modrinth API.      |

### to

Called once per file. Returns where that file is installed.

| `file.`         | Is                     |
| --------------- | ---------------------- |
| `filename`      | The jar's name.        |
| `versionId`     | The version you named. |
| `versionNumber` | Its version string.    |
| `projectId`     | The mod's project.     |
| `size`          | Size in bytes.         |

Start the path with a variable such as `${game_directory}`. It is filled
in on the player's machine.

## What it adds

| Kind        | What                       |
| ----------- | -------------------------- |
| Files       | One per version you named. |
| Launch      | None.                      |
| Variables   | None.                      |
| Environment | None.                      |

Each one below: what it is, and how it ends up in the
[manifest](/format/).

### Files · one per version

The version's primary file, from Modrinth's CDN, pinned by the sha1
Modrinth publishes. `path` is what your `to` returned.

<!-- prettier-ignore -->
```js{6-9}
// opys.config.mjs
export default defineConfig({
  plugins: [
    fabric({ version: '1.21.1' }),
    java({ version: '21' }),
    modrinth({
      to: (file) => '${game_directory}/mods/' + file.filename,
      versions: ['JjCVwmVA'],
    }),
  ],
  manifest: {
    command: '@fabric.command',
    args: ['@fabric.jvmArgs', '@fabric.mainClass', '@fabric.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// in the manifest
{
  "path": "${game_directory}/mods/sodium-fabric-0.8.12-beta.2+mc1.21.1.jar",
  "source": { "url": "https://cdn.modrinth.com/data/AANobbMI/versions/JjCVwmVA/sodium-fabric-0.8.12-beta.2%2Bmc1.21.1.jar" },
  "size": 1573186,
  "integrity": { "sha1": "6c8b02b70540dd3330c7877277b35fabcf1c2c4b" }
}
```

No launch pieces and no variables. Mods do not change how the game starts.

**Why by version and not by project:** "Sodium" is a moving target. One
version is one exact file.

## A whole modpack

<!-- prettier-ignore -->
```js
plugins: [
  modrinthModpack({ pack: 'xVcA1pSL' }),
  java({ version: '17' }),
],
manifest: {
  command: '@modrinthModpack.command',
  args: [
    '@modrinthModpack.jvmArgs',
    '@modrinthModpack.mainClass',
    '@modrinthModpack.gameArgs',
  ],
  workdir: '${game_directory}',
},
```

`pack` is a version ID, the version page's URL, or a direct `.mrpack` link.

It adds three things:

| What                         | Why                                                                        |
| ---------------------------- | -------------------------------------------------------------------------- |
| The loader the pack asks for | A pack is Fabric, Forge, NeoForge or vanilla. You should not have to look. |
| Every client-side file       | The pack's mods and resource packs.                                        |
| The pack's `overrides`       | Its configs, unpacked into `${game_directory}`.                            |

The launch pieces are the loader's, under the name `modrinthModpack`. So
the launch line is the same whichever loader the pack uses.

`loader: (spec) => …` lets you set the loader up yourself, for example with
a mirror. Quilt packs are not supported.

## Good to know

- opys installs what you name. It does not check a mod against your loader
  or Minecraft version.
- A mod's dependencies are not added. List them.
- One `to` per plugin. For a second folder, add the plugin again and
  rename it: `.as('resourcepacks')`.
- A modpack does not say which Java it wants. Add [`java`](./java).
