# @opys/minecraft-vanilla

[![npm](https://img.shields.io/npm/v/@opys/minecraft-vanilla.svg)](https://www.npmjs.com/package/@opys/minecraft-vanilla)

Vanilla Minecraft template — resolves the client JAR, asset index,
asset objects, and library classpath for any released version. The
substrate every forge-family loader (forge, neoforge, fabric,
cleanroom, lwjgl3ify) builds on.

Resolution and mapping live in the `opys-minecraft-vanilla` crate and reach JS
through `@opys/minecraft-binding`; this package is the typed surface
over it, plus the `minecraft()` plugin closure the build engine calls.
A native builder embedding the crate gets the same mappers and the same
contribution.

```sh
npm install @opys/minecraft-vanilla
```

```js
import { defineConfig } from '@opys/dev';
import { minecraft } from '@opys/minecraft-vanilla';
import { java } from '@opys/java';

export default defineConfig({
  output: 'opys.json',
  plugins: [minecraft('1.20.1'), java('17')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ minecraft }) => [
      minecraft.jvmArgs,
      minecraft.mainClass,
      minecraft.gameArgs,
    ],
    workdir: '${game_directory}',
  },
});
```

Pass no version (`minecraft()`) to resolve the latest stable release
at build time.

## Mappers

The mappers are exported because they are the shared half of the loader
family — `buildClasspath`, `buildLaunch`, `mapLibraries`,
`mapAssetIndex`, `mapAssetObjects`, `mapClientJar`, and the pure
`mapClientToTemplate(client, assets)`. A loader resolves a version JSON
its own way (an installer zip, a launcher profile, a GitHub release) and
then reuses these, so the per-OS classpath and the natives extraction
rule have exactly one implementation.

`fetchClient`, `clientToTemplate`, `fetchVersionManifest` and
`fetchAssetManifest` are the fetching half. Every entry point takes an
optional `manifestBase`, for a Mojang mirror or a stand-in server under
test.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
