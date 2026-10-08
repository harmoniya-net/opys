# @opys/lwjgl3ify

[![npm](https://img.shields.io/npm/v/@opys/lwjgl3ify.svg)](https://www.npmjs.com/package/@opys/lwjgl3ify)

`lwjgl3ify()` adds [lwjgl3ify](https://github.com/GTNewHorizons/lwjgl3ify), Forge on Minecraft
1.7.10 with LWJGL 3 and a modern Java: the game plus the lwjgl3ify and UniMixins
jars in `mods/`. Use it in place of `minecraft()` and `forge()`, with `java('25')`.

```sh
npm install -D @opys/dev @opys/lwjgl3ify @opys/java
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

- `version` is `1.7.10` (its `best` release), an alias such as
  `1.7.10-latest`, or a release tag such as `3.0.37`. Only a tag pins.
- lwjgl3ify does not load without UniMixins. `unimixins: false` leaves it out,
  and is for a pack that provides its own mixin runtime in `mods/`.
- Launching needs `username`, `uuid` and `token`, from `runClient` or `--var`.

## Documentation

- https://harmoniya-net.github.io/opys/plugins/lwjgl3ify
- https://harmoniya-net.github.io/opys/guide/loaders

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
