# @opys/modrinth

[![npm](https://img.shields.io/npm/v/@opys/modrinth.svg)](https://www.npmjs.com/package/@opys/modrinth)

The Modrinth plugins for opys: `modrinth` adds the mod files you name, and `modrinthModpack` adds a whole modpack with its loader and overrides. Neither needs an API key.

```sh
npm install -D @opys/dev @opys/minecraft @opys/modrinth
```

```js
import { fabric, java } from '@opys/minecraft';
import { modrinth } from '@opys/modrinth';

// In the `plugins` of defineConfig():
plugins: [
  fabric('1.21.1'),
  java('21'),
  modrinth({
    path: (info) => '${game_directory}/mods/' + info.filename,
    versions: [
      'N08Z8wog', // Lithium 0.15.4 for Fabric 1.21.1
    ],
  }),
],
```

- A file is named by its version, not its project: a version id or a version page URL. Each version contributes its primary file, pinned to the sha1 Modrinth lists.
- Versions are not checked against your loader or Minecraft version, and a mod's own dependencies are not added. List them yourself.
- `modrinthModpack(ref)` takes a version id, a version URL or a `.mrpack` link and stands up the loader the pack names. A Quilt pack fails the build. Add `java(...)` yourself.

## Documentation

- [modrinth plugin](https://harmoniya-net.github.io/opys/plugins/modrinth): options, modpacks, the `loader` option
- [Mods and files](https://harmoniya-net.github.io/opys/guide/mods): choosing between `modrinth`, `curseforge`, `links` and `files`

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit; re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
