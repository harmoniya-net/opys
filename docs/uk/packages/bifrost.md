# @opys/bifrost

[![npm](https://img.shields.io/npm/v/@opys/bifrost.svg)](https://www.npmjs.com/package/@opys/bifrost)

Bifrost для opys. `resolveBifrost()` створює токен входу гравця
для сервера [Bifrost](https://gitlab.com/harmoniya/bifrost)
під час запуску.

```sh
npm install -D @opys/dev @opys/bifrost @opys/minecraft-vanilla @opys/java
```

## Приклад

```js
// opys.config.mjs
import { defineConfig, userDataDir } from '@opys/dev';
import { java } from '@opys/java';
import { minecraft } from '@opys/minecraft-vanilla';
import { resolveBifrost } from '@opys/bifrost';

export default defineConfig({
  output: 'game.opys',
  plugins: [minecraft({ version: '1.21.1' }), java({ version: '21' })],
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

## Параметри

| Option       | Що це                                                                    |
| ------------ | ------------------------------------------------------------------------ |
| `privateKey` | Приватний ключ Ed25519 у вигляді PKCS#8 PEM. Рядок з `\n` теж підходить. |
| `username`   | Ім’я гравця.                                                             |
| `uuid`       | ID гравця.                                                               |
| `expiresIn`  | Час життя в секундах. Типово: 24 години.                                 |
| `now`        | Коли видано токен: `Date` або мілісекунди. Типово: зараз.                |

## Що він додає

Нічого в бандлі. Це не плагін, і він не йде в `plugins`: токен
належить одному гравцю і спливає, тож він створюється в `run`,
на комп’ютері гравця, при кожному запуску.

### Змінні, при запуску

Ті три, які ванільний Minecraft лишає відкритими.

```js
// що повертає resolveBifrost
{
  username: 'Player',
  uuid: '00000000-0000-0000-0000-000000000001',
  token: '<a signed token>',
}
```

Тримайте ключ поза `manifest`: усе звідти копіюється в бандл,
а бандл це zip, який може відкрити будь-хто.

## Кожен параметр

Кожен параметр, у кожному способі його використання.

```js
// токен для одного гравця, дійсний 24 години
resolveBifrost({
  privateKey: process.env.BIFROST_PRIVATE_KEY,
  username: 'Player',
  uuid: '00000000-0000-0000-0000-000000000001',
});

// коротший час життя, у секундах
resolveBifrost({
  privateKey: process.env.BIFROST_PRIVATE_KEY,
  username: 'Player',
  uuid: '00000000-0000-0000-0000-000000000001',
  expiresIn: 60 * 60,
});

// видано в названий вами час, для тесту, який має двічі дати той самий токен
resolveBifrost({
  privateKey: process.env.BIFROST_PRIVATE_KEY,
  username: 'Player',
  uuid: '00000000-0000-0000-0000-000000000001',
  now: new Date('2026-01-01T00:00:00Z'),
});
```

## Документація

- [Повна сторінка](https://harmoniya-net.github.io/opys/uk/plugins/bifrost): кожен параметр, і чому він працює саме так
- [Формат](https://harmoniya-net.github.io/opys/uk/format/): з чого складається маніфест

Частина [opys](https://github.com/harmoniya-net/opys). Також експортується з [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
