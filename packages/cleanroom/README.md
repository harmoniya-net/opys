# @opys/cleanroom

[![npm](https://img.shields.io/npm/v/@opys/cleanroom.svg)](https://www.npmjs.com/package/@opys/cleanroom)

`cleanroom()` adds [Cleanroom](https://github.com/CleanroomMC/Cleanroom), a
successor to Forge for Minecraft 1.12.2 on a modern Java with LWJGL 3: the game,
its libraries and assets. Use it in place of `minecraft()`.

```sh
npm install -D @opys/dev @opys/cleanroom @opys/java
```

```js
import { defineConfig } from '@opys/dev';
import { cleanroom } from '@opys/cleanroom';
import { java } from '@opys/java';

export default defineConfig({
  output: 'game.opys',
  plugins: [cleanroom('1.12.2'), java('25')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ cleanroom }) => [
      cleanroom.jvmArgs,
      cleanroom.mainClass,
      cleanroom.gameArgs,
    ],
    workdir: '${game_directory}',
  },
});
```

- `version` is `1.12.2` (its `best` release), an alias such as
  `1.12.2-latest`, or a release tag such as `0.6.13-alpha`. Only a tag pins.
- Use Java 25. opys does not check the pairing.
- Each release is a complete version document: no installer, no vanilla fetch.
- Launching needs `username`, `uuid` and `token`, from `runClient` or `--var`.

## Documentation

- https://harmoniya-net.github.io/opys/plugins/cleanroom
- https://harmoniya-net.github.io/opys/guide/loaders

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
