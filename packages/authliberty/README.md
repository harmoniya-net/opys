# @opys/authliberty

[![npm](https://img.shields.io/npm/v/@opys/authliberty.svg)](https://www.npmjs.com/package/@opys/authliberty)

An authlib-injector style `-javaagent` for opys. It rewires the game's Mojang account and session calls to the hosts you name, so players sign in against your own Yggdrasil server. It does not run that server.

```sh
npm install -D @opys/dev @opys/minecraft @opys/authliberty
```

```js
import { java, minecraft } from '@opys/minecraft';
import { authliberty } from '@opys/authliberty';

// In the config passed to defineConfig():
plugins: [
  minecraft('1.21.1'),
  authliberty('latest', {
    hosts: { auth: 'https://auth.example.com/authserver' },
  }),
  java('21'),
],
manifest: {
  command: ({ java }) => java.bin,
  args: ({ authliberty, minecraft }) => [
    authliberty.jvmArgs, // first: the agent loads before the game's auth code
    minecraft.jvmArgs,
    minecraft.mainClass,
    minecraft.gameArgs,
  ],
  workdir: '${game_directory}',
},
```

- `hosts` has the keys `auth`, `account`, `session` and `services`, or is a function of those four. A service you leave out stays on Mojang's.
- The version is exact, such as `'0.3'`, or `'latest'`. A `latest` hash is frozen when you build, so a later build may name a different jar.
- The jar is looked up in a GitLab package registry at build time and downloaded when a player installs.

## Documentation

- [authliberty plugin](https://harmoniya-net.github.io/opys/plugins/authliberty): options, host properties, what it contributes
- [Accounts, servers, GPUs](https://harmoniya-net.github.io/opys/guide/extras): signing players in

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit; re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
