# @opys/lwjgl3ify

[![npm](https://img.shields.io/npm/v/@opys/lwjgl3ify.svg)](https://www.npmjs.com/package/@opys/lwjgl3ify)

[lwjgl3ify](https://github.com/GTNewHorizons/lwjgl3ify) plugin — a
1.7.10 Forge variant on a modern LWJGL3 runtime. Bundles the required
[UniMixins](https://github.com/LegacyModdingMC/UniMixins) mod
automatically.

```sh
npm install @opys/lwjgl3ify
```

```js
import { defineConfig } from '@opys/dev';
import { lwjgl3ify } from '@opys/lwjgl3ify';
import { java } from '@opys/java';

export default defineConfig({
  output: 'opys.json',
  plugins: [lwjgl3ify('3.0.16'), java('21')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ lwjgl3ify }) => [
      lwjgl3ify.jvmArgs,
      lwjgl3ify.mainClass,
      lwjgl3ify.gameArgs,
    ],
    workdir: '${game_directory}',
  },
});
```

Each release ships a self-describing `version.json` asset (a
Mojang-format manifest with the vanilla 1.7.10 client URL, asset
index, and full library list inline) — no separate Forge-installer
extraction needed.

Pass `unimixins: false` to opt out of the bundled UniMixins (e.g.
if you'll deploy a different mixin runtime via your own mod-folder
pipeline).

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
