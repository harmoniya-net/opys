# @opys/fabric

[![npm](https://img.shields.io/npm/v/@opys/fabric.svg)](https://www.npmjs.com/package/@opys/fabric)

`fabric()` adds the Fabric mod loader to an opys installation: the game, its
libraries and assets, and Fabric's own libraries and launch arguments. You name
a Minecraft version, and the plugin picks a Fabric loader build for it from
Fabric Meta. Use it in place of `minecraft()`.

```sh
npm install -D @opys/dev @opys/fabric @opys/java
```

```js
import { defineConfig } from '@opys/dev';
import { fabric } from '@opys/fabric';
import { java } from '@opys/java';

export default defineConfig({
  output: 'game.opys',
  plugins: [fabric('1.21.4'), java('21')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ fabric }) => [fabric.jvmArgs, fabric.mainClass, fabric.gameArgs],
    workdir: '${game_directory}',
  },
});
```

- `version` is always the Minecraft version. There are no aliases and no build
  ids: `'1.21.4-best'` is not a version for Fabric.
- Without `loader` the newest stable loader build is used, so it can change
  between builds. Pin one: `fabric('1.21.4', { loader: '0.16.10' })`.
- Fabric needs nothing run on the launching machine before the game starts.
- Launching needs `username`, `uuid` and `token`, from `runClient` or `--var`.

## Documentation

- https://harmoniya-net.github.io/opys/plugins/fabric
- https://harmoniya-net.github.io/opys/guide/loaders
- https://harmoniya-net.github.io/opys/guide/java

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
