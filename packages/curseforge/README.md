# @opys/curseforge

[![npm](https://img.shields.io/npm/v/@opys/curseforge.svg)](https://www.npmjs.com/package/@opys/curseforge)

CurseForge for opys. `curseforge()` adds mods from CurseForge, each named by
one exact file.

```sh
npm install -D @opys/dev @opys/curseforge @opys/forge @opys/java
```

## Example

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { curseforge } from '@opys/curseforge';
import { forge } from '@opys/forge';
import { java } from '@opys/java';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    forge({ version: '1.20.1' }),
    java({ version: '17' }),
    curseforge({
      token: process.env.CURSEFORGE_TOKEN,
      files: [6307712],
      to: (file) => '${game_directory}/mods/' + file.filename,
    }),
  ],
  manifest: {
    command: '@forge.command',
    args: ['@forge.jvmArgs', '@forge.mainClass', '@forge.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Options

| Option    | What it does                                                               |
| --------- | -------------------------------------------------------------------------- |
| `files`   | File IDs, or file page URLs.                                               |
| `to`      | Where each file goes. Called with `{ filename, fileId, projectId, size }`. |
| `token`   | A CurseForge API key. Required.                                            |
| `apiBase` | A mirror of the CurseForge API.                                            |

Start the path `to` returns with a variable such as `${game_directory}`. It is
filled in on the player's machine.

Read the token from the environment, so the config can be committed:
`CURSEFORGE_TOKEN=your-key opys build`.

`curseforgeModpack({ token, file: 1040985 })` takes a whole modpack instead:
its loader, its mods and its overrides. Its launch pieces are the loader's,
under the name `curseforgeModpack`.

## What it adds

`opys build` turns the plugin into these parts of the manifest.

### Files · one per file ID

Pinned by the sha1 CurseForge publishes. `path` is what `to` returned.

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

The token is not added. It is used while building, and the download URLs are
public.

## Every option

Each option, in each way it is used.

```js
// files by ID, or by the URL of the file page
curseforge({
  token: process.env.CURSEFORGE_TOKEN,
  files: [
    6307712,
    'https://www.curseforge.com/minecraft/mc-mods/jei/files/6307712',
  ],
  to: (file) => '${game_directory}/mods/' + file.filename,
});

// `to` decides per file: here, by the project it belongs to
curseforge({
  token: process.env.CURSEFORGE_TOKEN,
  files: [6307712, 5101366],
  to: (file) =>
    file.projectId === 238222
      ? '${game_directory}/mods/' + file.filename
      : '${game_directory}/resourcepacks/' + file.filename,
});

// a mirror of the CurseForge API
curseforge({
  token: process.env.CURSEFORGE_TOKEN,
  files: [6307712],
  to: (file) => '${game_directory}/mods/' + file.filename,
  apiBase: 'https://mirror.example.com/curseforge/v1',
});

// a whole modpack: its loader, its mods, its overrides.
// By file ID, or by the URL of the file page
curseforgeModpack({ token: process.env.CURSEFORGE_TOKEN, file: 1040985 });
curseforgeModpack({
  token: process.env.CURSEFORGE_TOKEN,
  file: 'https://www.curseforge.com/minecraft/modpacks/my-pack/files/1040985',
});

// a Forge modpack, with the loader set up your way: here, through a mirror
curseforgeModpack({
  token: process.env.CURSEFORGE_TOKEN,
  file: 1040985,
  loader: (spec) =>
    forge({
      version: spec.version,
      source: 'https://mirror.example.com/forge',
    }),
});
```

## Documentation

- [The full page](https://harmoniya-net.github.io/opys/plugins/curseforge): every option, and why it works this way
- [The format](https://harmoniya-net.github.io/opys/format/): what a manifest is made of

Part of [opys](https://github.com/harmoniya-net/opys). Also exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
