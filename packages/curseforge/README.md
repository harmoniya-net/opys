# @opys/curseforge

[![npm](https://img.shields.io/npm/v/@opys/curseforge.svg)](https://www.npmjs.com/package/@opys/curseforge)

The CurseForge plugins for opys: `curseforge` adds the mod files you name, and `curseforgeModpack` adds a whole modpack with its loader and overrides. Both need a CurseForge API key at build time.

```sh
npm install -D @opys/dev @opys/minecraft @opys/curseforge
```

```js
import { forge, java } from '@opys/minecraft';
import { curseforge } from '@opys/curseforge';

const token = process.env.CURSEFORGE_TOKEN;
if (!token) throw new Error('Set CURSEFORGE_TOKEN to a CurseForge API key');

// In the `plugins` of defineConfig():
plugins: [
  forge('1.20.1'),
  java('17'),
  curseforge({
    token,
    path: (info) => '${game_directory}/mods/' + info.filename,
    files: [
      6717445, // a file id; the file's page URL works too
    ],
  }),
],
```

- The key is passed as `token`; the plugin does not read the environment itself. It is used at build time only, and the bundle installs without it.
- A file is named by its file id (the number after `/files/` in the file's page URL), not its project id. A mod's dependencies are not added.
- `curseforgeModpack({ token, file })` stands up the loader the pack names and unpacks its overrides. A Quilt pack fails the build. Add `java(...)` yourself.

## Documentation

- [curseforge plugin](https://harmoniya-net.github.io/opys/plugins/curseforge): options, modpacks, the `loader` option
- [Mods and files](https://harmoniya-net.github.io/opys/guide/mods): choosing between `modrinth`, `curseforge`, `links` and `files`

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit; re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
