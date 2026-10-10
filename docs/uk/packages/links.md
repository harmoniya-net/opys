# @opys/links

[![npm](https://img.shields.io/npm/v/@opys/links.svg)](https://www.npmjs.com/package/@opys/links)

Файли за посиланнями для opys. `links()` додає будь-який файл, на який
у вас є URL, зафіксований своїм хешем.

```sh
npm install -D @opys/dev @opys/links @opys/fabric @opys/java
```

## Приклад

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { fabric } from '@opys/fabric';
import { java } from '@opys/java';
import { links } from '@opys/links';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    fabric({ version: '1.21.1' }),
    java({ version: '21' }),
    links({
      links: [
        'https://modrinth.com/mod/sodium/version/SMxNOGZ6',
        'https://maven.fabricmc.net/…/fabric-api-0.116.0+1.21.1.jar',
      ],
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

| Параметр                                    | Що робить                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `links`                                     | URL: GitHub, GitLab, Modrinth, CurseForge або будь-що інше.                                     |
| `to`                                        | Куди потрапляє кожен файл. Викликається з `{ filename, link, url, provider, size, integrity }`. |
| `curseforgeToken`                           | Потрібен для посилань CurseForge.                                                               |
| `githubToken`                               | Піднімає ліміт частоти GitHub. Дістає приватні репозиторії.                                     |
| `gitlabToken`                               | Дістає приватні проєкти GitLab.                                                                 |
| `githubApi`, `modrinthApi`, `curseforgeApi` | Дзеркала.                                                                                       |

Починайте шлях, який повертає `to`, зі змінної на кшталт
`${game_directory}`. Вона заповнюється на комп'ютері гравця.

## Що він додає

`opys build` перетворює плагін на ці частини маніфесту.

### Файли · посилання на знайомий сайт

Сайт каже, що це за файл і який його хеш.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${game_directory}/mods/sodium-fabric-0.8.13+mc1.21.1.jar",
  "source": { "url": "https://cdn.modrinth.com/data/AANobbMI/versions/SMxNOGZ6/sodium-fabric-0.8.13%2Bmc1.21.1.jar" },
  "size": 1574609,
  "integrity": { "sha1": "003c114c85ca88ef3362e018deb6aca0c682d6a1" }
}
```

### Файли · будь-яке інше посилання

Ніхто не публікує хеш, тому opys раз завантажує файл під час збирання
і хешує його сам.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${game_directory}/mods/fabric-api-0.116.0+1.21.1.jar",
  "source": { "url": "https://maven.fabricmc.net/…/fabric-api-0.116.0+1.21.1.jar" },
  "size": 2410624,
  "integrity": { "sha256": "8604ed0741bd16f82dceb13f3ad2db28b002a9cd7972da74325530f65a31e939" }
}
```

Жодних частин запуску і жодних змінних.

## Кожен параметр

Кожен параметр, у кожному способі використання.

```js
// одне посилання кожного виду
links({
  links: [
    'https://github.com/owner/repo/releases/download/v1.0/mod-1.0.jar',
    'https://gitlab.com/api/v4/projects/owner%2Frepo/packages/generic/tool/1.0/tool.jar',
    'https://modrinth.com/mod/sodium/version/SMxNOGZ6',
    'https://www.curseforge.com/minecraft/mc-mods/jei/files/6307712',
    'https://example.com/files/anything.jar',
  ],
  to: (file) => '${game_directory}/mods/' + file.filename,
  curseforgeToken: process.env.CURSEFORGE_TOKEN, // потрібен для посилання CurseForge
});

// `to` вирішує для кожного файла: тут за тим, куди вказує посилання
links({
  links: [
    'https://modrinth.com/mod/sodium/version/SMxNOGZ6',
    'https://example.com/pack.zip',
  ],
  to: (file) =>
    file.provider === 'url'
      ? '${game_directory}/resourcepacks/' + file.filename
      : '${game_directory}/mods/' + file.filename,
});

// приватні репозиторії і вищий ліміт частоти GitHub
links({
  links: [
    'https://github.com/my-org/private/releases/download/v1.0/mod-1.0.jar',
  ],
  to: (file) => '${game_directory}/mods/' + file.filename,
  githubToken: process.env.GITHUB_TOKEN,
  gitlabToken: process.env.GITLAB_TOKEN,
});

// дзеркала API
links({
  links: ['https://modrinth.com/mod/sodium/version/SMxNOGZ6'],
  to: (file) => '${game_directory}/mods/' + file.filename,
  githubApi: 'https://github.example.com/api/v3',
  modrinthApi: 'https://mirror.example.com/modrinth/v2',
  curseforgeApi: 'https://mirror.example.com/curseforge/v1',
});
```

## Документація

- [Повна сторінка](https://harmoniya-net.github.io/opys/uk/plugins/links): кожен параметр, і чому він так працює
- [Формат](https://harmoniya-net.github.io/opys/uk/format/): з чого складається маніфест

Частина [opys](https://github.com/harmoniya-net/opys). Також експортується з [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
