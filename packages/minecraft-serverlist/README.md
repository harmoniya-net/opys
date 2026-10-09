# @opys/minecraft-serverlist

[![npm](https://img.shields.io/npm/v/@opys/minecraft-serverlist.svg)](https://www.npmjs.com/package/@opys/minecraft-serverlist)

The server list for opys. `serverlist()` pre-fills the multiplayer server
list of a pack.

```sh
npm install -D @opys/dev @opys/minecraft-serverlist @opys/minecraft-vanilla @opys/java
```

## Example

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { java } from '@opys/java';
import { minecraft } from '@opys/minecraft-vanilla';
import { serverlist } from '@opys/minecraft-serverlist';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
    serverlist({
      servers: [
        { name: 'My SMP', ip: 'mc.example.com' },
        { name: 'Friends', ip: 'friends.example.com:25566' },
      ],
    }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Options

| Option    | What it does                                                                         |
| --------- | ------------------------------------------------------------------------------------ |
| `servers` | The entries, `{ name, ip }`, in the order the game lists them. One may have `rules`. |
| `to`      | Where the file goes. Default `${game_directory}/servers.dat`.                        |

## What it adds

`opys build` turns the plugin into these parts of the manifest.

### Files · `servers.dat`

The file the game keeps its server list in. It is generated while building
and carried in the bundle as a blob, so nothing is downloaded.

<!-- prettier-ignore -->
```jsonc
// in the manifest
{
  "path": "${game_directory}/servers.dat",
  "source": { "blob": "f5b3f218f52d0ab5593094a9281e8905276a3e7aa405d5b78ea410a089e21b3b" },
  "size": 105
}
```

No launch pieces and no variables.

## Every option

Each option, in each way it is used.

```js
// servers, in the order the game lists them; a port goes after the address
serverlist({
  servers: [
    { name: 'My SMP', ip: 'mc.example.com' },
    { name: 'Friends', ip: 'friends.example.com:25566' },
  ],
});

// an entry only some players get
serverlist({
  servers: [
    { name: 'My SMP', ip: 'mc.example.com' },
    { name: 'Test', ip: 'test.example.com', rules: 'allow.features.beta' },
  ],
});

// another place for the file
serverlist({
  servers: [{ name: 'My SMP', ip: 'mc.example.com' }],
  to: '${game_directory}/config/servers.dat',
});
```

## Documentation

- [The full page](https://harmoniya-net.github.io/opys/plugins/serverlist): every option, and why it works this way
- [The format](https://harmoniya-net.github.io/opys/format/): what a manifest is made of

Part of [opys](https://github.com/harmoniya-net/opys). Also exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
