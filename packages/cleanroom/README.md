# @opys/cleanroom

[![npm](https://img.shields.io/npm/v/@opys/cleanroom.svg)](https://www.npmjs.com/package/@opys/cleanroom)

[Cleanroom](https://github.com/CleanroomMC/Cleanroom) loader plugin
— a 1.12.2 Forge successor on a modern JVM. Resolves a published version
document for the release; no installer is downloaded or run, at build time or
at launch.

```sh
npm install @opys/cleanroom
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

Accepts a Minecraft version (`'1.12.2'`, its newest recommended release), an
alias (`'1.12.2-latest'` | `'1.12.2-recommended'` | `'1.12.2-best'`), or an
exact release tag (`'0.6.13-alpha'`). Cleanroom needs JDK 25.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
