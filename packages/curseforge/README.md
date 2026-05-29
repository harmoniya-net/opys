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
      apiKey: process.env.CURSEFORGE_TOKEN,
      files: [
        238222, // Just Enough Items
        'https://curseforge.com/.../files/5847', // JourneyMap
      ],
    }),
  ],
});
```

Requires a [CurseForge API key](https://console.curseforge.com/)
passed as `apiKey` (or via the `CURSEFORGE_TOKEN` env var that the
opys integration tests use).

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
