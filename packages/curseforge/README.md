# @opys/curseforge

[![npm](https://img.shields.io/npm/v/@opys/curseforge.svg)](https://www.npmjs.com/package/@opys/curseforge)

CurseForge mod-file plugin — resolves a list of CurseForge file
references (numeric IDs or `/files/<id>` URLs) into downloadable
Artifacts via the [CurseForge API](https://docs.curseforge.com/).

```sh
npm install @opys/curseforge
```

```js
import { defineConfig } from '@opys/dev';
import { forge } from '@opys/forge';
import { curseforge } from '@opys/curseforge';

export default defineConfig({
  output: 'opys.json',
  plugins: [
    forge('1.20.1-best'),
    curseforge({
      token: process.env.CURSEFORGE_TOKEN,
      path: (info) => `\${game_directory}/mods/${info.filename}`,
      files: [
        238222, // Just Enough Items
        'https://curseforge.com/.../files/5847', // JourneyMap
      ],
    }),
  ],
});
```

Requires a [CurseForge API key](https://console.curseforge.com/)
passed as `token` (or via the `CURSEFORGE_TOKEN` env var that the
opys integration tests use).

## Modpacks

`curseforgeModpack({ token, file })` is the all-in-one modpack plugin.
Point it at a CurseForge modpack file and it does everything: downloads
and parses the pack's `manifest.json`, **detects the Minecraft version
and mod loader**, stands up the matching loader (Fabric / Forge /
NeoForge — which already bundles vanilla), installs every mod file, and
extracts the pack's `overrides/`.

```js
import { defineConfig } from '@opys/dev';
import { curseforgeModpack } from '@opys/curseforge';
import { java } from '@opys/java';

export default defineConfig({
  output: 'opys.json',
  plugins: [
    curseforgeModpack({
      token: process.env.CURSEFORGE_TOKEN,
      file: 1040985, // a modpack's CurseForge file id or /files/<id> URL
    }),
    java('17'),
  ],
  manifest: {
    command: ({ curseforgeModpack }) => curseforgeModpack.command,
    args: ({ curseforgeModpack }) => [
      curseforgeModpack.jvmArgs,
      curseforgeModpack.mainClass,
      curseforgeModpack.gameArgs,
    ],
    workdir: '${game_directory}',
  },
});
```

Every supported loader exposes the same launch groups, so the `manifest`
block is **loader-agnostic** — the same config launches a Fabric, Forge,
or NeoForge pack. Notes:

- **Token required** at build time (each file is resolved by ID through
  the authenticated API); the resulting URLs are public, so `opys launch`
  against a built manifest needs none.
- **Java is separate.** Add `java(...)` yourself (match the major version
  the pack's Minecraft release needs).
- The manifest's `files` go to `mods/`; everything else (resourcepacks,
  configs) ships in `overrides/`.
- **Quilt** packs are unsupported — opys has no Quilt loader plugin.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
