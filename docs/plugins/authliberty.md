# authliberty

`authliberty` makes the game sign players in against your own auth server
instead of Mojang's. It adds an authlib-injector style `-javaagent` to the
launch, which rewires the game's account and session calls to the hosts you
name. Use it when your players have accounts on a self-hosted Yggdrasil
server.

The plugin only redirects the game. It does not run an auth server, and it
does not give players an account. You still need a server that answers the
requests the game makes.

## Signature

```ts
authliberty(version: string, opts?: Omit<AuthLibertyOptions, 'version'>): ChainablePlugin
```

`version` is the AuthLiberty release to use: an exact version such as `'0.3'`,
or `'latest'`. When you build, the plugin asks the AuthLiberty GitLab package
registry where that jar is and what its sha256 is. The manifest records both,
and the jar itself is downloaded when a player installs. A version the registry
does not hold stops the build, with a message that lists up to eight versions it
does.

::: warning `latest` is frozen at build time
`'latest'` is the build that the project's `main` branch last published, as of
the moment you build. Its hash is written into the manifest then, so a later
build of the same config may name a different jar. Pin an exact version if
the players' installs must not change under you.
:::

The plugin is exported from `@opys/minecraft` and `@opys/authliberty`.

## Options

| Name      | Type                                                    | Default                   | Meaning                                                                                                                                 |
| --------- | ------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `hosts`   | `AuthLibertyHosts` or `(server) => string \| undefined` | none                      | Replacement host for each Mojang service. A service left out stays on Mojang's. See below.                                              |
| `project` | `string`                                                | `'harmoniya/authliberty'` | GitLab project path, `group/name`, that publishes the jar. It must hold a generic package named `authliberty` with a `.jar` file in it. |
| `gitlab`  | `string`                                                | `'https://gitlab.com'`    | GitLab instance URL.                                                                                                                    |
| `token`   | `string`                                                | none                      | GitLab token. Used only at build time, to look up the release. The installer downloads the jar without it.                              |

### `hosts`

As a map, each key replaces one service:

| Key        | Replaces                            | System property                 |
| ---------- | ----------------------------------- | ------------------------------- |
| `auth`     | `https://authserver.mojang.com`     | `-Dminecraft.api.auth.host`     |
| `account`  | `https://account.mojang.com`        | `-Dminecraft.api.account.host`  |
| `session`  | `https://sessionserver.mojang.com`  | `-Dminecraft.api.session.host`  |
| `services` | `https://api.minecraftservices.com` | `-Dminecraft.api.services.host` |

In a map, a key that is left out or empty stays on Mojang's.

As a function, it is called once for each of the four keys, with the key as
its argument. Return a URL to replace that service, or `undefined` (or an
empty string) to leave it on Mojang's. Only the URLs you return become
`-D` arguments.

```js
hosts: (server) =>
  server === 'auth' ? 'https://auth.example.com/authserver' : undefined,
```

The function runs at build time, so the URLs it returns are written into the
manifest. They are not secrets and belong there. Anything that differs per
player or per machine does not; see [Launch-time values](/guide/run-client).

## What it contributes

- **One artifact**: the agent jar, at
  `${library_directory}/net/harmoniya/authliberty/<version>/<file>`. It is a
  download, so it carries a `url`, a size and a sha256 (when GitLab reports
  one).
- **One launch group, `jvmArgs`**: a `-javaagent:` argument pointing at that
  jar, then one `-D` argument for each host you set, always in the order
  `auth`, `account`, `session`, `services`. There is no command and no main
  class.

The group is read as `authliberty.jvmArgs`. Put it **before** the loader's
JVM arguments, so the redirect is in place before any auth code runs.

```js
args: ({ authliberty, minecraft }) => [
  authliberty.jvmArgs, // first: the agent must load before the game's auth code
  minecraft.jvmArgs,
  minecraft.mainClass,
  minecraft.gameArgs,
],
```

## Example

This config builds without any secret. It needs network access to GitLab, and
it pins the current `latest` agent. `auth.example.com` is a placeholder for
your own server.

<<< @/examples/plugin-extras-authliberty/opys.config.mjs

The player's name, UUID and token are not in the config. `runClient` supplies
them at each launch, as it does for every config; see
[Launch-time values](/guide/run-client). `token: '0'` is the offline value
from [Getting started](/guide/getting-started). Against your own server, use
a token that server issues. [Bifrost](./bifrost) can mint one at launch.

## Related

- [Accounts, servers, GPUs](/guide/extras) covers signing players in.
- [All plugins](./) lists every plugin and its package.
