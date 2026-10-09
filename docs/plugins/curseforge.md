# CurseForge

The `curseforge` plugin, from `@opys/minecraft`.

Mods from CurseForge, named by file.

```js
curseforge({
  token: process.env.CURSEFORGE_TOKEN,
  to: (file) => '${game_directory}/mods/' + file.filename,
  files: [
    6717445, // a file ID
    'https://www.curseforge.com/minecraft/mc-mods/jei/files/6307712', // or its URL
  ],
});
```

## Options

| Option    | What it does                    |
| --------- | ------------------------------- |
| `files`   | File IDs, or file page URLs.    |
| `to`      | Where each file goes.           |
| `token`   | A CurseForge API key. Required. |
| `apiBase` | A mirror of the CurseForge API. |

**Why a token:** CurseForge has no anonymous API. Get a key from
[its console](https://console.curseforge.com/) and read it from the
environment, so the config can be committed.

```sh
CURSEFORGE_TOKEN=your-key opys build
```

### to

Called once per file. Returns where that file is installed.

| `file.`     | Is                  |
| ----------- | ------------------- |
| `filename`  | The jar's name.     |
| `fileId`    | The file you named. |
| `projectId` | The mod's project.  |
| `size`      | Size in bytes.      |

Start the path with a variable such as `${game_directory}`. It is filled
in on the player's machine.

## What it adds

| Kind        | What                    |
| ----------- | ----------------------- |
| Files       | One per file you named. |
| Launch      | None.                   |
| Variables   | None.                   |
| Environment | None.                   |

Each one below: what it is, and how it ends up in the
[manifest](/format/).

### Files · one per file ID

From CurseForge's CDN, pinned by the sha1 CurseForge publishes. `path` is
what your `to` returned.

<!-- prettier-ignore -->
```js{6-10}
// opys.config.mjs
export default defineConfig({
  plugins: [
    forge({ version: '1.20.1' }),
    java({ version: '17' }),
    curseforge({
      token: process.env.CURSEFORGE_TOKEN,
      to: (file) => '${game_directory}/mods/' + file.filename,
      files: [6307712],
    }),
  ],
  manifest: {
    command: '@forge.command',
    args: ['@forge.jvmArgs', '@forge.mainClass', '@forge.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// in the manifest
{
  "path": "${game_directory}/mods/<the file's name>.jar",
  "source": { "url": "https://edge.forgecdn.net/files/…/<the file's name>.jar" },
  "size": 1234567,
  "integrity": { "sha1": "…" }
}
```

No launch pieces and no variables.

**The token is not added.** It is used while building. The download URLs
are public, so players never need one.

## A whole modpack

```js
plugins: [
  curseforgeModpack({ token: process.env.CURSEFORGE_TOKEN, file: 1040985 }),
  java({ version: '17' }),
],
```

It adds the loader the pack asks for, every mod of the pack, and the pack's
`overrides` unpacked into `${game_directory}`.

The launch pieces are the loader's, under the name `curseforgeModpack`:
`'@curseforgeModpack.jvmArgs'` and so on. Quilt packs are not supported.

## Good to know

- A mod is named by its **file** ID, the number after `/files/`, not by
  its project ID.
- A mod's dependencies are not added. List them.
- A modpack does not say which Java it wants. Add [`java`](./java).
