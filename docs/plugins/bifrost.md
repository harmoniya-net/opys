# bifrost

`bifrost` signs a login token for one player, locally, at launch. Use it
when your players sign in to a self-hosted server that checks Bifrost tokens,
and you hold the Ed25519 private key that matches the server's public key.
The token skips Bifrost's OAuth `/token` flow: you mint it yourself, on the
launching machine, each time the game starts.

`bifrost` is not a plugin. It is a function you call inside `runClient`,
which runs on the launching machine each launch. It returns the username,
UUID and token, and you put them into `vars`.

## Signature

```ts
resolveBifrost(options: BifrostOptions): BifrostAuth
```

It is exported from `@opys/bifrost` as `resolveBifrost`, and from
`@opys/minecraft` under both `resolveBifrost` and the shorter name `bifrost`.
The two are the same function.

## Options

| Name         | Type               | Default            | Meaning                                                                                                           |
| ------------ | ------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `privateKey` | `string`           | none, required     | The Ed25519 private key, PEM, PKCS#8. See below.                                                                  |
| `username`   | `string`           | none, required     | The player's name. Goes into the token as the `username` claim.                                                   |
| `uuid`       | `string`           | none, required     | The player's UUID. Dashes are removed and the rest lowercased before signing. The value is not otherwise checked. |
| `expiresIn`  | `number`           | `86400` (24 hours) | Token lifetime in seconds. `0` leaves out the `exp` claim, so the token never expires.                            |
| `now`        | `number` or `Date` | the current time   | Issue time, in milliseconds since the epoch. Rarely needed; it makes a token reproducible in a test.              |

An unknown option is an error, so a misspelt option name fails the launch
rather than being ignored.

### `privateKey`

The key is PKCS#8 PEM, as `openssl` writes an Ed25519 key. Two forms are
accepted, so that a key can also be kept in a single-line setting such as a
`.env` file:

- the whole PEM, with real line breaks;
- one line, with each line break written as the two characters `\n`, and
  with or without the `-----BEGIN PRIVATE KEY-----` lines.

A key of another algorithm, such as RSA, is refused with a message that says
it must be Ed25519. An empty or missing key is refused with a message that
names `BIFROST_PRIVATE_KEY`.

## What it returns

```ts
interface BifrostAuth {
  username: string; // as given
  uuid: string; // as given, with the dashes removed and lowercased
  token: string; // a signed JWT, alg EdDSA
}
```

The token's claims are `uuid`, `username`, `iat` (seconds) and, unless
`expiresIn` is `0`, `exp`. It has the same shape as the token Bifrost's own
`/token` endpoint issues, so a server that validates Bifrost tokens accepts
it against the matching public key.

Signing is deterministic: the same options, with the same `now`, give the same
token. Without `now`, two tokens differ once the clock reaches the next second.

## Putting it into `vars`

The vanilla game reads three launch variables: `username`, `uuid` and
`token`. Its own variables, such as `auth_player_name` and
`auth_access_token`, are defined from those three. So return them under those
names and spread the rest of `manifest.vars` unchanged:

```js
runClient: (manifest) => {
  const auth = resolveBifrost({ /* … */ });
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

`runClient` replaces `vars` as a whole, so the spread is what keeps
`root` and the rest of the manifest's variables.

::: warning The private key stays on the launching machine
Never put `privateKey`, or the token, into `manifest`. Anything in `manifest`
is baked into the bundle and given to every player, and a key in a bundle is
a key anyone can use to mint tokens. `runClient` is the only place the key
belongs: it runs on the machine that launches the game, and its result is
never written into a bundle.

Read the key from the environment, as the example does, rather than writing
it in the config file.
:::

## Example

The config builds without your key, because `runClient` runs only at launch.
The key is read from the environment when the game starts.

<<< @/examples/plugin-extras-bifrost/opys.config.mjs

Run it with the key in the environment:

```sh
export BIFROST_PRIVATE_KEY="$(cat path/to/key.pem)"
opys launch
```

Building the config and then looking inside `game.opys` shows no key and no
token: the bundle holds `${username}`, `${uuid}` and `${token}` as the
variables they are, and the values arrive at launch.

A token expires after 24 hours unless you set `expiresIn`. Because `runClient`
runs on every launch, each launch gets a fresh token.

## Related

- [Launch-time values](/guide/run-client) explains `runClient` and `vars`.
- [Authliberty](./authliberty) adds the `-javaagent` that points the game at
  your auth server.
- [Accounts, servers, GPUs](/guide/extras) covers signing players in.
