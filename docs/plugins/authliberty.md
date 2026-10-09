# Custom auth server

The `authliberty` plugin, from `@opys/minecraft`.

Points the game at your own account server.

```js
authliberty({
  version: 'latest',
  hosts: {
    auth: 'https://auth.example.com/authserver',
    session: 'https://auth.example.com/sessionserver',
  },
});
```

The game normally asks Mojang about accounts.
[AuthLiberty](https://gitlab.com/harmoniya/authliberty) is a small Java
agent that redirects those calls. Your server must speak Yggdrasil,
Mojang's account protocol.

## Options

| Option                       | What it does                                          |
| ---------------------------- | ----------------------------------------------------- |
| `version`                    | An exact version (`'0.3'`), or `'latest'`.            |
| `hosts`                      | Which servers to redirect, and where.                 |
| `project`, `gitlab`, `token` | Where the agent jar is published, if not the default. |

`hosts` keys: `auth`, `account`, `session`, `services`. One you leave out
stays on Mojang's. It may also be a function of the key.

## What it adds

| Kind        | What           |
| ----------- | -------------- |
| Files       | The agent jar. |
| Launch      | `jvmArgs`.     |
| Variables   | None.          |
| Environment | None.          |

Each one below: what it is, and how it ends up in the
[manifest](/format/).

### Files · the agent jar

One jar, in the libraries folder.

<!-- prettier-ignore -->
```js{6-12}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
    authliberty({
      version: 'latest',
      hosts: {
        auth: 'https://auth.example.com/authserver',
        session: 'https://auth.example.com/sessionserver',
      },
    }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: [
      '@authliberty.jvmArgs',
      '@minecraft.jvmArgs',
      '@minecraft.mainClass',
      '@minecraft.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// in the manifest
{
  "path": "${library_directory}/net/harmoniya/authliberty/latest/authliberty-latest.jar",
  "source": { "url": "https://gitlab.com/api/v4/projects/harmoniya%2Fauthliberty/packages/generic/authliberty/latest/authliberty-latest.jar" },
  "size": 601888,
  "integrity": { "sha256": "aca98855bf83000fb48e3854929a83a7d4785785e4580dfa72c5727b0d3bdaaa" }
}
```

### Launch · `@authliberty.jvmArgs`

Loads the agent, then one line per host you set.

<!-- prettier-ignore -->
```js{6-12,17}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
    authliberty({
      version: 'latest',
      hosts: {
        auth: 'https://auth.example.com/authserver',
        session: 'https://auth.example.com/sessionserver',
      },
    }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: [
      '@authliberty.jvmArgs',
      '@minecraft.jvmArgs',
      '@minecraft.mainClass',
      '@minecraft.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// in the manifest
"args": [
  "-javaagent:${library_directory}/net/harmoniya/authliberty/latest/authliberty-latest.jar",
  "-Dminecraft.api.auth.host=https://auth.example.com/authserver",
  "-Dminecraft.api.session.host=https://auth.example.com/sessionserver"
  // … then the game's own JVM arguments
]
```

**Why you place it yourself, and first:** the agent must load before any
account code runs. Only the launch line decides order, and the launch line
is yours.

No variables.

## Good to know

- It decides _where_ the game asks. It does not decide _who_ the player is.
  That is the token: see [`bifrost`](./bifrost).
- `'latest'` is pinned to the jar that is latest when you build.
