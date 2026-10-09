# @opys/modrinth

[![npm](https://img.shields.io/npm/v/@opys/modrinth.svg)](https://www.npmjs.com/package/@opys/modrinth)

Modrinth for opys. `modrinth()` adds mods from Modrinth, each named by one
exact version.

```sh
npm install -D @opys/dev @opys/modrinth @opys/fabric @opys/java
```

## Example

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { fabric } from '@opys/fabric';
import { java } from '@opys/java';
import { modrinth } from '@opys/modrinth';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    fabric({ version: '1.21.1' }),
    java({ version: '21' }),
    modrinth({
      versions: ['JjCVwmVA'],
      to: (file) => '${game_directory}/mods/' + file.filename,
    }),
  ],
  manifest: {
    command: '@fabric.command',
    args: ['@fabric.jvmArgs', '@fabric.mainClass', '@fabric.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Options

| Option     | What it does                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------- |
| `versions` | Version IDs, or version page URLs.                                                           |
| `to`       | Where each file goes. Called with `{ filename, versionId, versionNumber, projectId, size }`. |
| `apiBase`  | A mirror of the Modrinth API.                                                                |

Start the path `to` returns with a variable such as `${game_directory}`. It is
filled in on the player's machine.

`modrinthModpack({ pack: 'xVcA1pSL' })` takes a whole modpack instead: its
loader, its mods and its overrides. Its launch pieces are the loader's, under
the name `modrinthModpack`.

## What it adds

`opys build` turns the plugin into these parts of the manifest.

### Files · one per version

The version's primary file, pinned by the sha1 Modrinth publishes. `path` is
what `to` returned.

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

No launch pieces and no variables.

## Every option

Each option, in each way it is used.

```js
// versions by ID, or by the URL of the version page
modrinth({
  versions: ['JjCVwmVA', 'https://modrinth.com/mod/sodium/version/SMxNOGZ6'],
  to: (file) => '${game_directory}/mods/' + file.filename,
});

// `to` decides per file: here, by the project it belongs to
modrinth({
  versions: ['JjCVwmVA', 'Xy12AbCd'],
  to: (file) =>
    file.projectId === 'AANobbMI'
      ? '${game_directory}/mods/' + file.filename
      : '${game_directory}/resourcepacks/' + file.filename,
});

// a mirror of the Modrinth API
modrinth({
  versions: ['JjCVwmVA'],
  to: (file) => '${game_directory}/mods/' + file.filename,
  apiBase: 'https://mirror.example.com/modrinth/v2',
});

// a whole modpack: its loader, its mods, its overrides.
// By version ID, by the URL of the version page, or by a link to the .mrpack
modrinthModpack({ pack: 'xVcA1pSL' });
modrinthModpack({
  pack: 'https://modrinth.com/modpack/my-pack/version/xVcA1pSL',
});
modrinthModpack({ pack: 'https://example.com/my-pack.mrpack' });

// a Forge modpack, with the loader set up your way: here, through a mirror
modrinthModpack({
  pack: 'xVcA1pSL',
  loader: (spec) =>
    forge({
      version: spec.version,
      source: 'https://mirror.example.com/forge',
    }),
});
```

## Documentation

- [The full page](https://harmoniya-net.github.io/opys/plugins/modrinth): every option, and why it works this way
- [The format](https://harmoniya-net.github.io/opys/format/): what a manifest is made of

Part of [opys](https://github.com/harmoniya-net/opys). Also exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
