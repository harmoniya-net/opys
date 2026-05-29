# @opys/forge

[![npm](https://img.shields.io/npm/v/@opys/forge.svg)](https://www.npmjs.com/package/@opys/forge)

Forge mod loader plugin — handles both the 1.7–1.12 legacy installer
era and the 1.13+ processor era.

```sh
npm install @opys/forge
```

```js
import { defineConfig } from '@opys/dev';
import { forge } from '@opys/forge';
import { java } from '@opys/java';

export default defineConfig({
  output: 'opys.json',
  plugins: [forge('1.20.1-best'), java('17')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ forge }) => [forge.jvmArgs, forge.mainClass, forge.gameArgs],
    workdir: '${game_directory}',
  },
});
```

`forge('1.20.1-best')` accepts the same selectors Forge's own
metadata service does: a full version (`1.20.1-47.4.20`), a per-MC
shortcut (`1.20.1-best`, `1.20.1-latest`, `1.20.1-recommended`), or
just the MC version (`1.20.1`) for the recommended build.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
