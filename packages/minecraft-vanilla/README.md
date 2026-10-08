# @opys/minecraft-vanilla

[![npm](https://img.shields.io/npm/v/@opys/minecraft-vanilla.svg)](https://www.npmjs.com/package/@opys/minecraft-vanilla)

The package behind the `minecraft()` plugin, which adds the vanilla client, its
libraries, natives and assets, for any version Mojang has published. It also
exports the mappers that every loader plugin shares.

```sh
npm install -D @opys/dev @opys/minecraft-vanilla @opys/java
```

```js
import { defineConfig } from '@opys/dev';
import { minecraft } from '@opys/minecraft-vanilla';
import { java } from '@opys/java';

export default defineConfig({
  output: 'game.opys',
  plugins: [minecraft('1.21.1'), java('21')],
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

- `minecraft()` with no version takes whatever Mojang's latest release is on
  the day you build. Name the version. `minecraft('latest')` is not an alias.
- A loader plugin already contributes the vanilla game; do not add both.
- Loader authors: nothing exported here folds an `inheritsFrom` document.
- Launching needs `username`, `uuid` and `token`, from `runClient` or `--var`.

## Documentation

- https://harmoniya-net.github.io/opys/plugins/minecraft
- https://harmoniya-net.github.io/opys/plugins/minecraft-vanilla

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
