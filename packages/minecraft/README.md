# @opys/minecraft

[![npm](https://img.shields.io/npm/v/@opys/minecraft.svg)](https://www.npmjs.com/package/@opys/minecraft)

Every Minecraft plugin for opys in one import. It has no code of its own: it
re-exports the packages below.

```sh
npm install -g @opys/cli
npm install -D @opys/dev @opys/minecraft
```

## Example

```js
// opys.config.mjs
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

## What is in it

### The game

Pick one. Each brings the game, its libraries and its command line.

| Plugin      | What it installs                    | Package                                                                            |
| ----------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| `minecraft` | The game with no mod loader.        | [`@opys/minecraft-vanilla`](https://www.npmjs.com/package/@opys/minecraft-vanilla) |
| `forge`     | Forge.                              | [`@opys/forge`](https://www.npmjs.com/package/@opys/forge)                         |
| `neoforge`  | NeoForge.                           | [`@opys/neoforge`](https://www.npmjs.com/package/@opys/neoforge)                   |
| `fabric`    | Fabric.                             | [`@opys/fabric`](https://www.npmjs.com/package/@opys/fabric)                       |
| `cleanroom` | Cleanroom: 1.12.2 on a modern Java. | [`@opys/cleanroom`](https://www.npmjs.com/package/@opys/cleanroom)                 |
| `lwjgl3ify` | lwjgl3ify: 1.7.10 on a modern Java. | [`@opys/lwjgl3ify`](https://www.npmjs.com/package/@opys/lwjgl3ify)                 |

### Java

| Plugin  | What it installs                       | Package                                                    |
| ------- | -------------------------------------- | ---------------------------------------------------------- |
| `java`  | A JDK, so players need none installed. | [`@opys/java`](https://www.npmjs.com/package/@opys/java)   |
| `dgpuj` | A shim that picks the dedicated GPU.   | [`@opys/dgpuj`](https://www.npmjs.com/package/@opys/dgpuj) |

### Mods and other files

| Plugin              | What it installs                             | Package                                                              |
| ------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| `modrinth`          | Files from Modrinth, by version.             | [`@opys/modrinth`](https://www.npmjs.com/package/@opys/modrinth)     |
| `modrinthModpack`   | A whole Modrinth modpack, loader included.   | [`@opys/modrinth`](https://www.npmjs.com/package/@opys/modrinth)     |
| `curseforge`        | Files from CurseForge, by file.              | [`@opys/curseforge`](https://www.npmjs.com/package/@opys/curseforge) |
| `curseforgeModpack` | A whole CurseForge modpack, loader included. | [`@opys/curseforge`](https://www.npmjs.com/package/@opys/curseforge) |
| `links`             | Any file you have a link to.                 | [`@opys/links`](https://www.npmjs.com/package/@opys/links)           |

`files`, for a folder on your disk, is in
[`@opys/dev`](https://www.npmjs.com/package/@opys/dev).

### Accounts and servers

| Export        | What it does                                    | Package                                                                                  |
| ------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `authliberty` | Points the game at your own auth servers.       | [`@opys/authliberty`](https://www.npmjs.com/package/@opys/authliberty)                   |
| `bifrost`     | Signs a login token. A function, used in `run`. | [`@opys/bifrost`](https://www.npmjs.com/package/@opys/bifrost)                           |
| `serverlist`  | Fills the multiplayer server list.              | [`@opys/minecraft-serverlist`](https://www.npmjs.com/package/@opys/minecraft-serverlist) |

## One import or several

Both work, and they are the same code.

```js
import { forge, java, modrinth } from '@opys/minecraft';
```

```js
import { forge } from '@opys/forge';
import { java } from '@opys/java';
import { modrinth } from '@opys/modrinth';
```

Two names differ here from the packages they come from:

| Here                | In its own package                                           |
| ------------------- | ------------------------------------------------------------ |
| `bifrost`           | `resolveBifrost` in `@opys/bifrost`. Both names work here.   |
| `DEFAULT_PLATFORMS` | Here it is `@opys/java`'s. `@opys/dgpuj` has one of its own. |

## Every plugin

Each plugin, as it is most often written. Every option is in the plugin's own
README.

<!-- prettier-ignore -->
```js
// the game: one of
minecraft({ version: '1.21.1' });
forge({ version: '1.20.1' });
neoforge({ version: '1.21.1' });
fabric({ version: '1.21.1' });
cleanroom({ version: '1.12.2' });
lwjgl3ify({ version: '1.7.10' });

// java
java({ version: '21' });
dgpuj();

// mods and other files
modrinth({ versions: ['Xbc0uyRg'], to: (file) => '${game_directory}/mods/' + file.filename });
curseforge({ files: [4835191], to: (file) => '${game_directory}/mods/' + file.filename, token });
links({ links: ['https://github.com/owner/repo/releases/download/v1.0/mod.jar'], to: (file) => '${game_directory}/mods/' + file.filename });
modrinthModpack({ pack: 'xVcA1pSL' });
curseforgeModpack({ file: 1040985, token });

// accounts and servers
authliberty({ version: 'latest', hosts: { auth: 'https://auth.example.com' } });
serverlist({ servers: [{ name: 'My server', ip: 'play.example.com' }] });
bifrost({ privateKey, username: 'Player', uuid: '00000000-0000-0000-0000-000000000001' }); // in `run`
```

## Documentation

- [Introduction](https://harmoniya-net.github.io/opys/basics/intro): a first pack
- [All plugins](https://harmoniya-net.github.io/opys/plugins/): one page each

Part of [opys](https://github.com/harmoniya-net/opys).
