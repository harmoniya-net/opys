# @opys/bifrost

[![npm](https://img.shields.io/npm/v/@opys/bifrost.svg)](https://www.npmjs.com/package/@opys/bifrost)

Bifrost for opys. `resolveBifrost()` makes a player's login token for a
[Bifrost](https://gitlab.com/harmoniya/bifrost) server, at launch.

```sh
npm install -D @opys/dev @opys/bifrost @opys/minecraft-vanilla @opys/java
```

## Example

```js
// opys.config.mjs
import { defineConfig, userDataDir } from '@opys/dev';
import { java } from '@opys/java';
import { minecraft } from '@opys/minecraft-vanilla';
import { resolveBifrost } from '@opys/bifrost';

export default defineConfig({
  output: 'game.opys',
  plugins: [minecraft({ version: '1.21.1' }), java({ version: '21' })],
  manifest: {
    command: '@minecraft.command',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
  },
  run: (manifest) => ({
    vars: {
      ...manifest.vars,
      root: userDataDir('my-pack'),
      ...resolveBifrost({
        privateKey: process.env.BIFROST_PRIVATE_KEY,
        username: 'Player',
        uuid: '00000000-0000-0000-0000-000000000001',
      }),
    },
  }),
});
```

## Options

| Option       | What it is                                                           |
| ------------ | -------------------------------------------------------------------- |
| `privateKey` | An Ed25519 private key, as PKCS#8 PEM. One line with `\n` works too. |
| `username`   | The player's name.                                                   |
| `uuid`       | The player's ID.                                                     |
| `expiresIn`  | Lifetime in seconds. Default: 24 hours.                              |
| `now`        | When the token is issued, a `Date` or milliseconds. Default: now.    |

## What it adds

Nothing in the bundle. It is not a plugin and does not go in `plugins`: a
token belongs to one player and expires, so it is made in `run`, on the
player's machine, at every launch.

### Variables, at launch

The three that vanilla Minecraft leaves open.

```js
// what resolveBifrost returns
{
  username: 'Player',
  uuid: '00000000-0000-0000-0000-000000000001',
  token: '<a signed token>',
}
```

Keep the key out of `manifest`: everything there is copied into the bundle,
and a bundle is a zip anyone can open.

## Every option

Each option, in each way it is used.

```js
// a token for one player, valid for 24 hours
resolveBifrost({
  privateKey: process.env.BIFROST_PRIVATE_KEY,
  username: 'Player',
  uuid: '00000000-0000-0000-0000-000000000001',
});

// a shorter life, in seconds
resolveBifrost({
  privateKey: process.env.BIFROST_PRIVATE_KEY,
  username: 'Player',
  uuid: '00000000-0000-0000-0000-000000000001',
  expiresIn: 60 * 60,
});

// issued at a time you name, for a test that must give the same token twice
resolveBifrost({
  privateKey: process.env.BIFROST_PRIVATE_KEY,
  username: 'Player',
  uuid: '00000000-0000-0000-0000-000000000001',
  now: new Date('2026-01-01T00:00:00Z'),
});
```

## Documentation

- [The full page](https://harmoniya-net.github.io/opys/plugins/bifrost): every option, and why it works this way
- [The format](https://harmoniya-net.github.io/opys/format/): what a manifest is made of

Part of [opys](https://github.com/harmoniya-net/opys). Also exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
