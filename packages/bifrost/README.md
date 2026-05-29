# @opys/bifrost

[![npm](https://img.shields.io/npm/v/@opys/bifrost.svg)](https://www.npmjs.com/package/@opys/bifrost)

Mint a [Bifrost](https://gitlab.com/harmoniya/bifrost)-compatible JWT
locally so opys's `runClient` can launch Minecraft against a
self-hosted Yggdrasil server without going through the OAuth `/token`
flow. Signed with Ed25519 (alg `EdDSA`).

```sh
npm install @opys/bifrost
```

```js
import { defineConfig, userDataDir } from '@opys/dev';
import { minecraft } from '@opys/minecraft-vanilla';
import { resolveBifrost } from '@opys/bifrost';

export default defineConfig({
  output: 'opys.json',
  plugins: [minecraft('1.20.1')],
  manifest: {
    /* … */
  },
  // runClient runs every launch on the launch machine — the right
  // place for machine-local paths and a freshly-minted auth token.
  runClient: (manifest) => {
    const auth = resolveBifrost({
      privateKey: process.env.BIFROST_PRIVATE_KEY,
      username: 'deitylamb',
      uuid: '00000000-0000-0000-0000-000000000000',
    });
    return {
      vars: {
        ...manifest.vars,
        root: userDataDir('my-pack'),
        auth_player_name: auth.username,
        auth_uuid: auth.uuid,
        auth_access_token: auth.token,
      },
    };
  },
});
```

Pure helper — no plugin factory. Pair it with
[`@opys/authliberty`](https://www.npmjs.com/package/@opys/authliberty)
to wire the `-javaagent` that points Minecraft at your Bifrost server.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
