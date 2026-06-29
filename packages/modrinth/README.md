# @opys/modrinth

[![npm](https://img.shields.io/npm/v/@opys/modrinth.svg)](https://www.npmjs.com/package/@opys/modrinth)

Modrinth mod-file plugin — resolves a list of Modrinth version
references (version IDs or `/version/<id>` URLs) into downloadable
Artifacts via the [Modrinth API](https://docs.modrinth.com/). Each
version contributes its primary file.

```sh
npm install @opys/modrinth
```

```js
import { defineConfig } from '@opys/dev';
import { fabric } from '@opys/fabric';
import { modrinth } from '@opys/modrinth';

export default defineConfig({
  output: 'opys.json',
  plugins: [
    fabric('1.20.1'),
    modrinth({
      path: (info) => `\${game_directory}/mods/${info.filename}`,
      versions: [
        'JjCVwmVA', // Sodium
        'https://modrinth.com/mod/lithium/version/4FmrPNTr',
      ],
    }),
  ],
});
```

No API token is required — Modrinth's API is open and the artifact URLs
are public CDN links.

## Modpacks

`modrinthModpack(ref)` is the all-in-one modpack plugin. Point it at a
Modrinth modpack version (a version id, a version URL, or a direct
`.mrpack` URL) and it does everything: parses the pack's
`modrinth.index.json`, **detects the Minecraft version and mod loader**,
stands up the matching loader (Fabric / Forge / NeoForge — which already
bundles vanilla), installs every client-side file, and extracts the
pack's `overrides/`.

```js
import { defineConfig } from '@opys/dev';
import { modrinthModpack } from '@opys/modrinth';
import { java } from '@opys/java';

export default defineConfig({
  output: 'opys.json',
  plugins: [
    modrinthModpack('fDlgR3Ps'), // a Modrinth modpack version id or URL
    java('17'),
  ],
  manifest: {
    command: ({ modrinthModpack }) => modrinthModpack.command,
    args: ({ modrinthModpack }) => [
      modrinthModpack.jvmArgs,
      modrinthModpack.mainClass,
      modrinthModpack.gameArgs,
    ],
    workdir: '${game_directory}',
  },
});
```

Every supported loader exposes the same launch groups, so the `manifest`
block above is **loader-agnostic** — the same config launches a Fabric,
Forge, or NeoForge pack. Notes:

- **Java is separate.** A `.mrpack` does not pin a JDK, so add `java(...)`
  yourself (match the major version the pack's Minecraft release needs).
- **Client side.** Files marked `unsupported` on the client are skipped;
  `overrides/` and `client-overrides/` are both extracted.
- **Quilt** packs are unsupported — opys has no Quilt loader plugin.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
