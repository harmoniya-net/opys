# @opys/minecraft-serverlist

[![npm](https://img.shields.io/npm/v/@opys/minecraft-serverlist.svg)](https://www.npmjs.com/package/@opys/minecraft-serverlist)

Write the game's `servers.dat`, so the multiplayer screen already lists your servers when a player first opens it. The file is built from the list you give and carried in the bundle like any other file.

```sh
npm install -D @opys/dev @opys/minecraft-serverlist
```

```js
import { serverlist } from '@opys/minecraft-serverlist';

// In the `plugins` of defineConfig():
serverlist([
  { name: 'My SMP', ip: 'mc.example.com' },
  { name: 'Friends', ip: 'friends.example.com:25566' },
]),
```

- `serverlist(servers, options?)` is a plugin. An entry is `{ name, ip, rules? }`, and `options.path` defaults to `${game_directory}/servers.dat`.
- The bytes are in the bundle, so nothing is fetched at install. The file is checked like any other, so a list the player changed is put back to yours.
- Give every entry the same `rules`, or none. With more than one ruleset only one group's file is kept and the other entries are dropped.
- An empty list still writes a file, and it replaces the player's list.

## Documentation

- [serverlist plugin](https://harmoniya-net.github.io/opys/plugins/serverlist): options and what it contributes
- [Accounts, servers, GPUs](https://harmoniya-net.github.io/opys/guide/extras): pre-filling the server list

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit; re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
