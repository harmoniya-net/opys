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
  output: 'game.opys',
  plugins: [lwjgl3ify('1.7.10'), java('25')],
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

Accepts a Minecraft version (`'1.7.10'`, its newest recommended release), an
alias (`'1.7.10-latest'` | `'1.7.10-recommended'` | `'1.7.10-best'`), or an
exact release tag (`'3.0.37'`).

Each release ships a complete `version.json`; opys resolves a published copy
of it with every library given a path, a hash and a size. The lwjgl3ify mod
jar and UniMixins are added under `mods/` from their GitHub releases — pass
`token` if you hit GitHub's anonymous rate limit.

Pass `unimixins: false` to opt out of the bundled UniMixins (e.g.
if you'll deploy a different mixin runtime via your own mod-folder
pipeline).

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
