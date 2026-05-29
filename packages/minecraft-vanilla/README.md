# @opys/minecraft-vanilla

[![npm](https://img.shields.io/npm/v/@opys/minecraft-vanilla.svg)](https://www.npmjs.com/package/@opys/minecraft-vanilla)

Vanilla Minecraft template — resolves the client JAR, asset index,
asset objects, and library classpath for any released version. The
substrate every forge-family loader (forge, cleanroom, lwjgl3ify)
builds on.

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

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
