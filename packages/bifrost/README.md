# @opys/bifrost

[![npm](https://img.shields.io/npm/v/@opys/bifrost.svg)](https://www.npmjs.com/package/@opys/bifrost)

Sign a [Bifrost](https://gitlab.com/harmoniya/bifrost) login token for one player, locally, at launch. `resolveBifrost` is a function you call inside `runClient`, not a plugin. It signs an Ed25519 JWT (`alg: EdDSA`) with a private key you hold, which skips the OAuth `/token` flow.

```sh
npm install -D @opys/dev @opys/bifrost
```

```js
import { resolveBifrost } from '@opys/bifrost';

// In the config passed to defineConfig():
runClient: (manifest) => {
  const auth = resolveBifrost({
    privateKey: process.env.BIFROST_PRIVATE_KEY,
    username: 'Player',
    uuid: '00000000-0000-0000-0000-000000000001',
  });
  return {
    vars: {
      ...manifest.vars,
      username: auth.username,
      uuid: auth.uuid,
      token: auth.token,
    },
  };
},
```

- The game reads the three vars `username`, `uuid` and `token`. Its other account variables are defined from those.
- `privateKey` is a PKCS#8 PEM, whole or on one line with `\n` for the line breaks. Read it from the environment and never put it in `manifest`, which is written into the bundle.
- A token lasts 24 hours unless you set `expiresIn`. `runClient` runs on every launch, so each launch gets a fresh one.
- Pair it with `@opys/authliberty`, which points the game at your server.

## Documentation

- [bifrost](https://harmoniya-net.github.io/opys/plugins/bifrost): every option, the returned token, the key formats
- [Accounts, servers, GPUs](https://harmoniya-net.github.io/opys/guide/extras): signing players in

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit; re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
