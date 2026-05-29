# @opys/cleanroom

[![npm](https://img.shields.io/npm/v/@opys/cleanroom.svg)](https://www.npmjs.com/package/@opys/cleanroom)

[Cleanroom](https://github.com/CleanroomMC/Cleanroom) loader plugin
— a 1.12.2 Forge variant on a modern JVM. Resolves the installer JAR
straight off GitHub Releases and extracts the bundled Maven tree at
install time.

```sh
npm install @opys/cleanroom
```

```js
import { defineConfig } from '@opys/dev';
import { cleanroom } from '@opys/cleanroom';
import { java } from '@opys/java';

export default defineConfig({
  output: 'opys.json',
  plugins: [cleanroom('0.5.9-alpha'), java('21')],
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

Accepts an exact tag, `'latest'` (newest non-prerelease — currently
none), or `'prerelease'` (newest including prereleases).

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
