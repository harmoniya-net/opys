# @opys/minecraft-serverlist

[![npm](https://img.shields.io/npm/v/@opys/minecraft-serverlist.svg)](https://www.npmjs.com/package/@opys/minecraft-serverlist)

Emit a Minecraft `servers.dat` (NBT) Artifact from a JS-side list of
servers. Pre-populates the multiplayer server list so users land on
your server with one click after first launch.

```sh
npm install @opys/minecraft-serverlist
```

```js
import { defineConfig } from '@opys/dev';
import { minecraft } from '@opys/minecraft-vanilla';
import { resolveServerlist } from '@opys/minecraft-serverlist';

export default defineConfig({
  output: 'opys.json',
  plugins: [
    minecraft('1.20.1'),
    {
      name: 'servers',
      build: () => ({
        artifacts: [
          resolveServerlist({
            path: '${game_directory}/servers.dat',
            entries: [{ name: 'My SMP', ip: 'mc.example.com', hidden: false }],
          }),
        ],
      }),
    },
  ],
});
```

Encodes uncompressed NBT via [`nbtify`](https://www.npmjs.com/package/nbtify);
the resulting bytes are inlined as a `bytes` Source so no fetch
happens at install time.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
