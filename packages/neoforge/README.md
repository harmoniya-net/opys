# @opys/neoforge

[![npm](https://img.shields.io/npm/v/@opys/neoforge.svg)](https://www.npmjs.com/package/@opys/neoforge)

`neoforge()` adds a NeoForge build to an opys installation: the game and
NeoForge's libraries, assets and launch arguments, for every Minecraft version
in NeoForge's index from 1.20.2 on. Use it in place of `minecraft()`.

```sh
npm install -D @opys/dev @opys/neoforge @opys/java
```

```js
import { defineConfig } from '@opys/dev';
import { neoforge } from '@opys/neoforge';
import { java } from '@opys/java';

export default defineConfig({
  output: 'game.opys',
  plugins: [neoforge('1.21.1'), java('21')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ neoforge }) => [
      neoforge.jvmArgs,
      neoforge.mainClass,
      neoforge.gameArgs,
    ],
    workdir: '${game_directory}',
  },
});
```

- `version` is a Minecraft version (its `best` build), an alias such as
  `1.21.1-latest`, or a build id such as `21.1.172`. Only a build id pins.
- A build id is looked up, never parsed: `neoforge('26.2.0.84')` works alone.
- Java: `17` for 1.20.2 to 1.20.4, `21` for 1.20.5 to 1.21.x, `25` for 26.x.
- Launching needs `username`, `uuid` and `token`, from `runClient` or `--var`.

## Documentation

- https://harmoniya-net.github.io/opys/plugins/neoforge
- https://harmoniya-net.github.io/opys/guide/loaders

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
