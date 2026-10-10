# @opys/modrinth

[![npm](https://img.shields.io/npm/v/@opys/modrinth.svg)](https://www.npmjs.com/package/@opys/modrinth)

Modrinth для opys. `modrinth()` додає моди з Modrinth, кожен
названий однією точною версією.

```sh
npm install -D @opys/dev @opys/modrinth @opys/fabric @opys/java
```

## Приклад

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { fabric } from '@opys/fabric';
import { java } from '@opys/java';
import { modrinth } from '@opys/modrinth';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    fabric({ version: '1.21.1' }),
    java({ version: '21' }),
    modrinth({
      versions: ['JjCVwmVA'],
      to: (file) => '${game_directory}/mods/' + file.filename,
    }),
  ],
  manifest: {
    command: '@fabric.command',
    args: ['@fabric.jvmArgs', '@fabric.mainClass', '@fabric.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Параметри

| Option     | Що робить                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `versions` | ID версій або адреси сторінок версій.                                                          |
| `to`       | Куди йде кожен файл. Викликається з `{ filename, versionId, versionNumber, projectId, size }`. |
| `apiBase`  | Дзеркало API Modrinth.                                                                         |

Починайте шлях, який повертає `to`, зі змінної, такої як
`${game_directory}`. Він підставляється на комп’ютері гравця.

`modrinthModpack({ pack: 'xVcA1pSL' })` бере цілий модпак замість
цього: його завантажувач, його моди та його перевизначення. Його
частини запуску це частини завантажувача, під іменем
`modrinthModpack`.

## Що він додає

`opys build` перетворює плагін на ці частини маніфесту.

### Файли · один на версію

Головний файл версії, зафіксований sha1, який публікує Modrinth.
`path` це те, що повернув `to`.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${game_directory}/mods/sodium-fabric-0.8.12-beta.2+mc1.21.1.jar",
  "source": { "url": "https://cdn.modrinth.com/data/AANobbMI/versions/JjCVwmVA/sodium-fabric-0.8.12-beta.2%2Bmc1.21.1.jar" },
  "size": 1573186,
  "integrity": { "sha1": "6c8b02b70540dd3330c7877277b35fabcf1c2c4b" }
}
```

Ні частин запуску, ні змінних.

## Кожен параметр

Кожен параметр, у кожному способі його використання.

```js
// версії за ID або за адресою сторінки версії
modrinth({
  versions: ['JjCVwmVA', 'https://modrinth.com/mod/sodium/version/SMxNOGZ6'],
  to: (file) => '${game_directory}/mods/' + file.filename,
});

// `to` вирішує для кожного файла: тут за проєктом, до якого він належить
modrinth({
  versions: ['JjCVwmVA', 'Xy12AbCd'],
  to: (file) =>
    file.projectId === 'AANobbMI'
      ? '${game_directory}/mods/' + file.filename
      : '${game_directory}/resourcepacks/' + file.filename,
});

// дзеркало API Modrinth
modrinth({
  versions: ['JjCVwmVA'],
  to: (file) => '${game_directory}/mods/' + file.filename,
  apiBase: 'https://mirror.example.com/modrinth/v2',
});

// цілий модпак: його завантажувач, його моди, його перевизначення.
// За ID версії, за адресою сторінки версії або за посиланням на .mrpack
modrinthModpack({ pack: 'xVcA1pSL' });
modrinthModpack({
  pack: 'https://modrinth.com/modpack/my-pack/version/xVcA1pSL',
});
modrinthModpack({ pack: 'https://example.com/my-pack.mrpack' });

// модпак Forge, із завантажувачем, налаштованим по-вашому: тут через дзеркало
modrinthModpack({
  pack: 'xVcA1pSL',
  loader: (spec) =>
    forge({
      version: spec.version,
      source: 'https://mirror.example.com/forge',
    }),
});
```

## Документація

- [Повна сторінка](https://harmoniya-net.github.io/opys/uk/plugins/modrinth): кожен параметр, і чому він працює саме так
- [Формат](https://harmoniya-net.github.io/opys/uk/format/): з чого складається маніфест

Частина [opys](https://github.com/harmoniya-net/opys). Також експортується з [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
