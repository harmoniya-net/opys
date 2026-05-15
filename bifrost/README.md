# @torba/bifrost

Local JWT minter for [Bifrost](https://gitlab.com/harmoniya/bifrost) — a self-hosted Yggdrasil-compatible Minecraft auth server. Pair with `@torba/authliberty` to launch Minecraft against Bifrost without going through Bifrost's OAuth `/token` flow.

## Install

```sh
npm install @torba/bifrost
```

## Usage

```ts
import { resolveBifrost } from '@torba/bifrost';

const auth = resolveBifrost({
  privateKey: process.env.BIFROST_PRIVATE_KEY, // Ed25519 PKCS8 PEM
  username: 'Player',
  uuid: '00000000-0000-0000-0000-000000000000',
});

// auth.username, auth.uuid, auth.token — spread directly into runClient.vars
```

In a torba config, paired with AuthLiberty pointing at Bifrost:

```ts
import { resolveAuthliberty } from '@torba/authliberty';
import { resolveBifrost } from '@torba/bifrost';
import { resolveLwjgl3ify } from '@torba/lwjgl3ify';

const lw = await resolveLwjgl3ify({ version: '3.0.16' });
const al = await resolveAuthliberty({
  version: '0.3',
  hosts: (s) => `https://yggdrasil.harmoniya.net/${s}`,
});
const auth = resolveBifrost({
  privateKey: process.env.BIFROST_PRIVATE_KEY,
  username: 'Player',
  uuid: '...',
});

return {
  manifest: {
    artifacts: [lw.artifacts, al.artifacts],
    launch: {
      ...lw.launch,
      args: [...lw.jvmArgs, ...al.jvmArgs, lw.mainClass, ...lw.gameArgs],
    },
    vars: lw.vars,
  },
  runClient: {
    workdir: '${game_directory}',
    vars: { root: '...', game_directory: '...', ...auth },
  },
};
```

## Options

```ts
resolveBifrost({
  privateKey: string,   // Ed25519 PKCS8 PEM (literal `\n` accepted; header optional)
  username: string,
  uuid: string,         // dashes stripped automatically
  expiresIn?: number,   // seconds; default 86400 (24h). 0 → no `exp` claim
  now?: Date | number,  // override iat (ms since epoch); default Date.now()
});
```

## How it works

Bifrost's `authMiddleware` validates incoming bearer tokens with a single Ed25519 public key (`alg: EdDSA`) and only requires two claims: `uuid` and `username`. This package signs a token with the matching private key — same algorithm and same payload shape (`{ uuid, username, iat, exp }`) as Bifrost's own `/token` endpoint mints — so it passes validation directly.

No network, no DB, no I/O — pure local Node `crypto.sign(null, …, ed25519Key)`. The package has zero runtime dependencies.

## Security

The Ed25519 private key is the root of trust for your auth server: anyone with it can impersonate any player. Keep it out of repo / shipped binaries; load it from an env var, secrets manager, or local file at build time. Per-player keys are not needed — Bifrost only checks the signature, not the issuer.
