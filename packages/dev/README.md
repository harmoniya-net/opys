# @opys/dev

[![npm](https://img.shields.io/npm/v/@opys/dev.svg)](https://www.npmjs.com/package/@opys/dev)

What you write an opys config with: `defineConfig`, `definePlugin`, the
`files` plugin and `userDataDir`. The example also uses `@opys/minecraft`.

```sh
npm install -D @opys/dev
```

```js
import { defineConfig, files, userDataDir } from '@opys/dev';
import { forge, java } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    forge({ version: '1.20.1' }),
    java({ version: '17' }),
    files({ from: 'mods', to: (file) => '${game_directory}/mods/' + file.rel }),
  ],
  manifest: {
    command: '@forge.command',
    args: ['@forge.jvmArgs', '-Xmx4G', '@forge.mainClass', '@forge.gameArgs'],
    workdir: '${game_directory}',
  },
  run: (manifest) => ({
    vars: { ...manifest.vars, root: userDataDir('my-pack') },
  }),
});
```

- `plugins` say what the pack is made of. `manifest` says how to start it: a
  string that begins with `@` is a piece of the command line a plugin offers,
  anything else is passed as written.
- `run` is called on the player's machine at every launch. Paths and accounts
  go there, never under `manifest`, which is copied into the bundle.
- `files` carries a folder from your disk inside the bundle.
- `definePlugin({ name, build })` makes a plugin of your own.

## Documentation

- [The config](https://harmoniya-net.github.io/opys/basics/config)
- [Writing a plugin](https://harmoniya-net.github.io/opys/plugins/writing-a-plugin)

Part of [opys](https://github.com/harmoniya-net/opys).
