# @opys/curseforge

[![npm](https://img.shields.io/npm/v/@opys/curseforge.svg)](https://www.npmjs.com/package/@opys/curseforge)

CurseForge для opys. `curseforge()` додає моди з CurseForge, кожен
названий одним точним файлом.

```sh
npm install -D @opys/dev @opys/curseforge @opys/forge @opys/java
```

## Приклад

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { curseforge } from '@opys/curseforge';
import { forge } from '@opys/forge';
import { java } from '@opys/java';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    forge({ version: '1.20.1' }),
    java({ version: '17' }),
    curseforge({
      token: process.env.CURSEFORGE_TOKEN,
      files: [6307712],
      to: (file) => '${game_directory}/mods/' + file.filename,
    }),
  ],
  manifest: {
    command: '@forge.command',
    args: ['@forge.jvmArgs', '@forge.mainClass', '@forge.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Параметри

| Option    | Що робить                                                                    |
| --------- | ---------------------------------------------------------------------------- |
| `files`   | ID файлів або адреси сторінок файлів.                                        |
| `to`      | Куди йде кожен файл. Викликається з `{ filename, fileId, projectId, size }`. |
| `token`   | Ключ API CurseForge. Обов’язковий.                                           |
| `apiBase` | Дзеркало API CurseForge.                                                     |

Починайте шлях, який повертає `to`, зі змінної, такої як
`${game_directory}`. Він підставляється на комп’ютері гравця.

Читайте токен зі змінних середовища, щоб конфігурацію можна було
комітити: `CURSEFORGE_TOKEN=your-key opys build`.

`curseforgeModpack({ token, file: 1040985 })` бере цілий модпак
замість цього: його завантажувач, його моди та його перевизначення.
Його частини запуску це частини завантажувача, під іменем
`curseforgeModpack`.

## Що він додає

`opys build` перетворює плагін на ці частини маніфесту.

### Файли · один на ID файла

Зафіксовано sha1, який публікує CurseForge. `path` це те,
що повернув `to`.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${game_directory}/mods/<the file's name>.jar",
  "source": { "url": "https://edge.forgecdn.net/files/…/<the file's name>.jar" },
  "size": 1234567,
  "integrity": { "sha1": "…" }
}
```

Ні частин запуску, ні змінних.

Токен не додається. Він використовується під час збирання,
а адреси завантаження публічні.

## Кожен параметр

Кожен параметр, у кожному способі його використання.

```js
// файли за ID або за адресою сторінки файла
curseforge({
  token: process.env.CURSEFORGE_TOKEN,
  files: [
    6307712,
    'https://www.curseforge.com/minecraft/mc-mods/jei/files/6307712',
  ],
  to: (file) => '${game_directory}/mods/' + file.filename,
});

// `to` вирішує для кожного файла: тут за проєктом, до якого він належить
curseforge({
  token: process.env.CURSEFORGE_TOKEN,
  files: [6307712, 5101366],
  to: (file) =>
    file.projectId === 238222
      ? '${game_directory}/mods/' + file.filename
      : '${game_directory}/resourcepacks/' + file.filename,
});

// дзеркало API CurseForge
curseforge({
  token: process.env.CURSEFORGE_TOKEN,
  files: [6307712],
  to: (file) => '${game_directory}/mods/' + file.filename,
  apiBase: 'https://mirror.example.com/curseforge/v1',
});

// цілий модпак: його завантажувач, його моди, його перевизначення.
// За ID файла або за адресою сторінки файла
curseforgeModpack({ token: process.env.CURSEFORGE_TOKEN, file: 1040985 });
curseforgeModpack({
  token: process.env.CURSEFORGE_TOKEN,
  file: 'https://www.curseforge.com/minecraft/modpacks/my-pack/files/1040985',
});

// модпак Forge, із завантажувачем, налаштованим по-вашому: тут через дзеркало
curseforgeModpack({
  token: process.env.CURSEFORGE_TOKEN,
  file: 1040985,
  loader: (spec) =>
    forge({
      version: spec.version,
      source: 'https://mirror.example.com/forge',
    }),
});
```

## Документація

- [Повна сторінка](https://harmoniya-net.github.io/opys/uk/plugins/curseforge): кожен параметр, і чому він працює саме так
- [Формат](https://harmoniya-net.github.io/opys/uk/format/): з чого складається маніфест

Частина [opys](https://github.com/harmoniya-net/opys). Також експортується з [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
