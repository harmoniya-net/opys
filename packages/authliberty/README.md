# @opys/authliberty

[![npm](https://img.shields.io/npm/v/@opys/authliberty.svg)](https://www.npmjs.com/package/@opys/authliberty)

A custom auth server for opys. `authliberty()` adds
[authliberty](https://gitlab.com/harmoniya/authliberty), an agent that points
the game at your own account server.

```sh
npm install -D @opys/dev @opys/authliberty @opys/minecraft-vanilla @opys/java
```

## Example

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { authliberty } from '@opys/authliberty';
import { java } from '@opys/java';
import { minecraft } from '@opys/minecraft-vanilla';

export default defineConfig({
  output: 'game.opys',
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

## Options

| Option                       | What it does                                                              |
| ---------------------------- | ------------------------------------------------------------------------- |
| `version`                    | An exact version (`'0.3'`), or `'latest'`.                                |
| `hosts`                      | `auth`, `account`, `session`, `services`. One left out stays on Mojang's. |
| `project`, `gitlab`, `token` | Where the agent jar is published, if not the default.                     |

## What it adds

`opys build` turns the plugin into these parts of the manifest.

### Files · the agent jar

One jar, in the libraries folder.

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

### Launch

One piece: loads the agent, then one line per host. Put it first, because
the agent must load before any account code runs.

<!-- prettier-ignore -->
```jsonc
// in the manifest
"launch": {
  "args": [
    // '@authliberty.jvmArgs'
    "-javaagent:${library_directory}/net/harmoniya/authliberty/latest/authliberty-latest.jar",
    "-Dminecraft.api.auth.host=https://auth.example.com/authserver",
    "-Dminecraft.api.session.host=https://auth.example.com/sessionserver",
    // … the game's own arguments
  ]
}
```

No variables.

## Every option

Each option, in each way it is used.

```js
// the newest agent, or one exact version
authliberty({ version: 'latest' });
authliberty({ version: '0.3' });

// every server on your host; one left out stays on Mojang's
authliberty({
  version: '0.3',
  hosts: {
    auth: 'https://auth.example.com/authserver',
    account: 'https://auth.example.com/account',
    session: 'https://auth.example.com/sessionserver',
    services: 'https://auth.example.com/services',
  },
});

// hosts as a function of the server's name
authliberty({
  version: '0.3',
  hosts: (server) => 'https://auth.example.com/' + server,
});

// the agent jar from your own GitLab project
authliberty({
  version: '0.3',
  project: 'my-group/authliberty',
  gitlab: 'https://gitlab.example.com',
  token: process.env.GITLAB_TOKEN,
});
```

## Documentation

- [The full page](https://harmoniya-net.github.io/opys/plugins/authliberty): every option, and why it works this way
- [The format](https://harmoniya-net.github.io/opys/format/): what a manifest is made of

Part of [opys](https://github.com/harmoniya-net/opys). Also exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
