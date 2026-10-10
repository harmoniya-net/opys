# @opys/minecraft-serverlist

[![npm](https://img.shields.io/npm/v/@opys/minecraft-serverlist.svg)](https://www.npmjs.com/package/@opys/minecraft-serverlist)

Список серверів для opys. `serverlist()` заздалегідь заповнює
список серверів для мережевої гри у збірці.

```sh
npm install -D @opys/dev @opys/minecraft-serverlist @opys/minecraft-vanilla @opys/java
```

## Приклад

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { java } from '@opys/java';
import { minecraft } from '@opys/minecraft-vanilla';
import { serverlist } from '@opys/minecraft-serverlist';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
    serverlist({
      servers: [
        { name: 'My SMP', ip: 'mc.example.com' },
        { name: 'Friends', ip: 'friends.example.com:25566' },
      ],
    }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Параметри

| Option    | Що робить                                                                                |
| --------- | ---------------------------------------------------------------------------------------- |
| `servers` | Записи, `{ name, ip }`, у порядку, в якому їх показує гра. Один запис може мати `rules`. |
| `to`      | Куди записується файл. Типово `${game_directory}/servers.dat`.                           |

## Що він додає

`opys build` перетворює плагін на ці частини маніфесту.

### Файли · `servers.dat`

Файл, у якому гра тримає свій список серверів. Він створюється
під час збирання і переноситься в бандлі як блоб, тож нічого
не завантажується.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${game_directory}/servers.dat",
  "source": { "blob": "f5b3f218f52d0ab5593094a9281e8905276a3e7aa405d5b78ea410a089e21b3b" },
  "size": 105
}
```

Ні частин запуску, ні змінних.

## Кожен параметр

Кожен параметр, у кожному способі його використання.

```js
// сервери в порядку, в якому їх показує гра; порт іде після адреси
serverlist({
  servers: [
    { name: 'My SMP', ip: 'mc.example.com' },
    { name: 'Friends', ip: 'friends.example.com:25566' },
  ],
});

// запис, який отримують лише деякі гравці
serverlist({
  servers: [
    { name: 'My SMP', ip: 'mc.example.com' },
    { name: 'Test', ip: 'test.example.com', rules: 'allow.features.beta' },
  ],
});

// інше місце для файла
serverlist({
  servers: [{ name: 'My SMP', ip: 'mc.example.com' }],
  to: '${game_directory}/config/servers.dat',
});
```

## Документація

- [Повна сторінка](https://harmoniya-net.github.io/opys/uk/plugins/serverlist): кожен параметр, і чому він працює саме так
- [Формат](https://harmoniya-net.github.io/opys/uk/format/): з чого складається маніфест

Частина [opys](https://github.com/harmoniya-net/opys). Також експортується з [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
