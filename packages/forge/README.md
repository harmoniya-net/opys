# @opys/forge

[![npm](https://img.shields.io/npm/v/@opys/forge.svg)](https://www.npmjs.com/package/@opys/forge)

`forge()` adds a Forge build to an opys installation: the game, its libraries
and assets, and Forge's own libraries and launch arguments, for every Minecraft
version in Forge's index from 1.1 on. Use it in place of `minecraft()`.

```sh
npm install -D @opys/dev @opys/forge @opys/java
```

```js
import { defineConfig } from '@opys/dev';
import { forge } from '@opys/forge';
import { java } from '@opys/java';

export default defineConfig({
  output: 'game.opys',
  plugins: [forge('1.20.1'), java('17')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ forge }) => [forge.jvmArgs, forge.mainClass, forge.gameArgs],
    workdir: '${game_directory}',
  },
});
```

- `version` is a Minecraft version (its `best` build), an alias such as
  `1.20.1-latest`, or a build id such as `1.20.1-47.4.10`. Only a build id pins.
- Java follows the Minecraft version, with two exceptions: 1.7.2 needs
  `java('7', { vendor: 'zulu' })` and 1.16.4 needs `java('8u312-b07')`.
- Builds that need Forge's processors run, or the client jar rewritten, do so
  on the launching machine through horno. There is nothing to configure.
- Launching needs `username`, `uuid` and `token`, from `runClient` or `--var`.

## Documentation

- https://harmoniya-net.github.io/opys/plugins/forge
- https://harmoniya-net.github.io/opys/guide/loaders
- https://harmoniya-net.github.io/opys/guide/java

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
