# @opys/authliberty

[![npm](https://img.shields.io/npm/v/@opys/authliberty.svg)](https://www.npmjs.com/package/@opys/authliberty)

[AuthLiberty](https://gitlab.com/harmoniya/authliberty) plugin — an
`authlib-injector`-style `-javaagent` that rewires Minecraft's
Mojang-account calls to a self-hosted Yggdrasil server. Resolves
the agent JAR from a GitLab generic package registry.

```sh
npm install @opys/authliberty
```

```js
import { defineConfig } from '@opys/dev';
import { minecraft } from '@opys/minecraft-vanilla';
import { authliberty } from '@opys/authliberty';
import { java } from '@opys/java';

export default defineConfig({
  output: 'opys.json',
  plugins: [
    minecraft('1.20.1'),
    authliberty('0.3', {
      hosts: { authserver: 'https://auth.example.com' },
    }),
    java('17'),
  ],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ minecraft, authliberty }) => [
      authliberty.jvmArgs, // -javaagent argument
      minecraft.jvmArgs,
      minecraft.mainClass,
      minecraft.gameArgs,
    ],
    workdir: '${game_directory}',
  },
});
```

Accepts an exact version (`'0.3'`) or `'latest'` (the auto-updating
`latest` channel — sha256 is frozen at build time).

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
