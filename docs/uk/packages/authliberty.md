# @opys/authliberty

[![npm](https://img.shields.io/npm/v/@opys/authliberty.svg)](https://www.npmjs.com/package/@opys/authliberty)

Власний сервер авторизації для opys. `authliberty()` додає
[authliberty](https://gitlab.com/harmoniya/authliberty), агент, який
спрямовує гру на ваш власний сервер облікових записів.

```sh
npm install -D @opys/dev @opys/authliberty @opys/minecraft-vanilla @opys/java
```

## Приклад

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

## Параметри

| Option                       | Що робить                                                                 |
| ---------------------------- | ------------------------------------------------------------------------- |
| `version`                    | Точна версія (`'0.3'`) або `'latest'`.                                    |
| `hosts`                      | `auth`, `account`, `session`, `services`. Пропущений лишається на Mojang. |
| `project`, `gitlab`, `token` | Де опубліковано jar агента, якщо не типово.                               |

## Що він додає

`opys build` перетворює плагін на ці частини маніфесту.

### Файли · jar агента

Один jar у теці бібліотек.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${library_directory}/net/harmoniya/authliberty/latest/authliberty-latest.jar",
  "source": { "url": "https://gitlab.com/api/v4/projects/harmoniya%2Fauthliberty/packages/generic/authliberty/latest/authliberty-latest.jar" },
  "size": 601888,
  "integrity": { "sha256": "aca98855bf83000fb48e3854929a83a7d4785785e4580dfa72c5727b0d3bdaaa" }
}
```

### Запуск

Одна частина: завантажує агент, потім по одному рядку на хост.
Поставте її першою, бо агент має завантажитися раніше за будь-який
код облікових записів.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"launch": {
  "args": [
    // '@authliberty.jvmArgs'
    "-javaagent:${library_directory}/net/harmoniya/authliberty/latest/authliberty-latest.jar",
    "-Dminecraft.api.auth.host=https://auth.example.com/authserver",
    "-Dminecraft.api.session.host=https://auth.example.com/sessionserver",
    // … аргументи самої гри
  ]
}
```

Немає змінних.

## Кожен параметр

Кожен параметр, у кожному способі його використання.

```js
// найновіший агент або одна точна версія
authliberty({ version: 'latest' });
authliberty({ version: '0.3' });

// кожен сервер на вашому хості; пропущений лишається на Mojang
authliberty({
  version: '0.3',
  hosts: {
    auth: 'https://auth.example.com/authserver',
    account: 'https://auth.example.com/account',
    session: 'https://auth.example.com/sessionserver',
    services: 'https://auth.example.com/services',
  },
});

// хости як функція імені сервера
authliberty({
  version: '0.3',
  hosts: (server) => 'https://auth.example.com/' + server,
});

// jar агента з вашого власного проєкту GitLab
authliberty({
  version: '0.3',
  project: 'my-group/authliberty',
  gitlab: 'https://gitlab.example.com',
  token: process.env.GITLAB_TOKEN,
});
```

## Документація

- [Повна сторінка](https://harmoniya-net.github.io/opys/uk/plugins/authliberty): кожен параметр, і чому він працює саме так
- [Формат](https://harmoniya-net.github.io/opys/uk/format/): з чого складається маніфест

Частина [opys](https://github.com/harmoniya-net/opys). Також експортується з [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
