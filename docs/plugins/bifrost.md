# Bifrost

The `resolveBifrost` function, from `@opys/minecraft`.

Makes a player's login token, at launch.

<!-- prettier-ignore -->
```js{15-24}
// opys.config.mjs
import { defineConfig, userDataDir } from '@opys/dev';
import { java, minecraft, resolveBifrost } from '@opys/minecraft';

export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
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

`resolveBifrost` signs a token that a
[Bifrost](https://gitlab.com/harmoniya/bifrost) server accepts, with a
private key you hold.

## It is not a plugin

It does not go in `plugins`, and it adds **nothing** to the bundle.

**Why:** a token belongs to one player and expires. A bundle is the same
for everyone and lasts. So the token is made in
[`run`](/basics/config#run), on the player's machine, at every launch.

## Options

| Option       | What it is                              |
| ------------ | --------------------------------------- |
| `privateKey` | An Ed25519 private key, as PKCS#8 PEM.  |
| `username`   | The player's name.                      |
| `uuid`       | The player's ID.                        |
| `expiresIn`  | Lifetime in seconds. Default: 24 hours. |

## What it returns

`{ username, uuid, token }`: exactly the three variables
[`minecraft`](./minecraft#variables) leaves open. Spread it into `vars`.

## Good to know

::: warning Keep the key out of `manifest`
Everything under `manifest` is copied into the bundle, and a bundle is a
zip anyone can open. Read the key from the environment, inside `run`.
:::

- The key may be one line, with `\n` for line breaks. Handy for an
  environment variable.
- Pair it with [`authliberty`](./authliberty), which points the game at
  your server.
