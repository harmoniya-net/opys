# @opys/minecraft

[![npm](https://img.shields.io/npm/v/@opys/minecraft.svg)](https://www.npmjs.com/package/@opys/minecraft)

Every Minecraft plugin for opys in one import. This package has no code of its
own. It re-exports the loaders (`minecraft`, `forge`, `neoforge`, `fabric`,
`cleanroom`, `lwjgl3ify`), `java`, the mod sources (`modrinth`, `curseforge`,
`links`) and the extras (`authliberty`, `bifrost`, `serverlist`, `dgpuj`).

```sh
npm install -g @opys/cli
npm install -D @opys/dev @opys/minecraft
```

```js
import { defineConfig, userDataDir } from '@opys/dev';
import { forge, java } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [forge({ version: '1.20.1' }), java({ version: '17' })],
  manifest: {
    command: '@forge.command',
    args: ['@forge.jvmArgs', '@forge.mainClass', '@forge.gameArgs'],
    workdir: '${game_directory}',
  },
  run: (manifest) => ({
    vars: {
      ...manifest.vars,
      root: userDataDir('my-pack'),
      username: 'Player',
      uuid: '00000000-0000-0000-0000-000000000001',
      token: '0',
    },
  }),
});
```

Then `opys launch`.

- `files`, for a folder on your disk, comes from `@opys/dev`.
- Each plugin is also published as its own package, if you want only one.

## Documentation

- [Introduction](https://harmoniya-net.github.io/opys/basics/intro)
- [All plugins](https://harmoniya-net.github.io/opys/plugins/)

Part of [opys](https://github.com/harmoniya-net/opys).
