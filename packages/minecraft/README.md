# @opys/minecraft

The Minecraft meta-package for opys. It has no code of its own: it re-exports
the loader, provider and helper packages, so a config can take its plugins from
one import.

```sh
npm install -D @opys/dev @opys/minecraft
```

```js
import { defineConfig } from '@opys/dev';
import { forge, java } from '@opys/minecraft';

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

- Every plugin on the plugins page is exported from here, except `files`, which
  comes from `@opys/dev`. `bifrost` is a function for `runClient`, not a plugin.
- Each package is also published on its own. Install that one instead if you
  want only one plugin.
- `@opys/dgpuj` and `@opys/java` both export `DEFAULT_PLATFORMS`, so this
  package re-exports only `@opys/java`'s. Import dgpuj's from `@opys/dgpuj`.
- Launching needs `username`, `uuid` and `token`, from `runClient` or `--var`.

## Documentation

- https://harmoniya-net.github.io/opys/plugins/
- https://harmoniya-net.github.io/opys/guide/getting-started
