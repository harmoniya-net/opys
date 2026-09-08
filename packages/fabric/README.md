# @opys/fabric

[![npm](https://img.shields.io/npm/v/@opys/fabric.svg)](https://www.npmjs.com/package/@opys/fabric)

The Fabric mod loader — resolves a loader build from Fabric Meta, reads its
launcher profile, and folds the profile's libraries and arguments onto the
vanilla version it inherits from.

Resolution and mapping live in the `opys-fabric` crate and reach JS through
`@opys/fabric-binding`; this package is the typed surface over it, plus the
`fabric()` plugin closure the build engine calls. A native builder embedding
the crate gets the same fold and the same contribution.

```sh
npm install @opys/fabric
```

```js
import { defineConfig } from '@opys/dev';
import { fabric } from '@opys/fabric';
import { java } from '@opys/java';

export default defineConfig({
  output: 'opys.json',
  plugins: [fabric('1.21.4'), java('21')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ fabric }) => [fabric.jvmArgs, fabric.mainClass, fabric.gameArgs],
    workdir: '${game_directory}',
  },
});
```

`version` is always the **Minecraft** version — a Fabric loader build is
independent of it. Omit `loader` for the newest stable build targeting that
version, or pin one: `fabric('1.21.4', { loader: '0.16.10' })`.

## Options

- `loader` — pin a Fabric loader build. Default: the newest `stable` build
  Meta lists for `version`.
- `source` — Fabric Meta base URL. Default: `DEFAULT_FABRIC_META`
  (`https://meta.fabricmc.net`).
- `manifestBase` — the Mojang version manifest, when it is not Mojang's own —
  a mirror, or a stand-in server under test.

`resolveFabric(options)` returns the template directly — artifacts, vars, the
per-OS `classpath` arms, and the decomposed `jvmArgs` / `mainClass` /
`gameArgs` — for composing with other plugins.
`resolveFabricVersion(game, meta?, loader?)` resolves just the release
(`{ gameVersion, loaderVersion, profileUrl }`); with a loader pinned it makes
no request at all.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
