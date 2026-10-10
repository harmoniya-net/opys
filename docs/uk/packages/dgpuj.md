# @opys/dgpuj

[![npm](https://img.shields.io/npm/v/@opys/dgpuj.svg)](https://www.npmjs.com/package/@opys/dgpuj)

Дискретна відеокарта для opys. `dgpuj()` додає
[dgpuj](https://github.com/harmoniya-net/dgpuj), малу програму, яка
стартує Java на швидкій відеокарті ноутбука, що має дві.

```sh
npm install -D @opys/dev @opys/dgpuj @opys/java @opys/minecraft-vanilla
```

## Приклад

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { dgpuj } from '@opys/dgpuj';
import { java } from '@opys/java';
import { minecraft } from '@opys/minecraft-vanilla';

export default defineConfig({
  output: 'game.opys',
  plugins: [minecraft({ version: '1.21.1' }), java({ version: '21' }), dgpuj()],
  manifest: {
    command: '@dgpuj.bin',
    args: [
      '--dgpuj-home',
      '@java.home',
      '@minecraft.jvmArgs',
      '@minecraft.mainClass',
      '@minecraft.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

## Параметри

| Параметр                   | Що робить                                                 |
| -------------------------- | --------------------------------------------------------- |
| `version`                  | `'latest'` (типово), `'prerelease'` або тег (`'v0.3.0'`). |
| `platforms`                | Які платформи його отримують.                             |
| `repo`, `token`, `apiBase` | Звідки він завантажується, і токен GitHub.                |

## Що він додає

`opys build` перетворює плагін на ці частини маніфесту.

### Файли · один архів на платформу

П'ять архівів. `rules` вибирають один, а `extract` дістає виконуваний
файл.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${dgpuj_dir}/dgpuj-x86_64-pc-windows-msvc.zip",
  "source": { "url": "https://github.com/harmoniya-net/dgpuj/releases/download/v0.3.0/dgpuj-x86_64-pc-windows-msvc.zip" },
  "size": 77321,
  "rules": ["allow.os.windows", "allow.arch.x86_64"],
  "integrity": { "sha256": "3dc7ef481abdd390cbb0ba23137d808b4b8652b23a49915f761a4bc422969a13" },
  "extract": { "file": "dgpuj.exe", "into": "${dgpuj_dir}/dgpuj.exe" }
}
```

### Запуск

Одна частина, виконуваний файл. Він йде в `command`, і йому кажуть,
де знаходиться Java.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"launch": {
  // '@dgpuj.bin'
  "command": "${dgpuj_bin}",
  "args": [
    "--dgpuj-home",
    // '@java.home'
    "${java_home}",
    // … власні аргументи гри
  ]
}
```

### Змінні

Де знаходиться виконуваний файл, для кожної ОС.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"vars": {
  "dgpuj_dir": "${root}/dgpuj",
  "dgpuj_bin": [
    { "value": "${dgpuj_dir}/dgpuj.exe", "rules": "allow.os.windows" },
    { "value": "${dgpuj_dir}/dgpuj", "rules": "allow.os.linux" },
    { "value": "${dgpuj_dir}/dgpuj", "rules": "allow.os.osx" }
  ]
}
```

## Кожен параметр

Кожен параметр, у кожному способі використання.

```js
// останній випуск
dgpuj();

// останній пререліз або один точний тег
dgpuj({ version: 'prerelease' });
dgpuj({ version: 'v0.3.0' });

// лише деякі платформи; DEFAULT_PLATFORMS експортується з @opys/dgpuj
dgpuj({ platforms: DEFAULT_PLATFORMS.filter((p) => p.os === 'windows') });

// форк, з токеном GitHub для ліміту частоти
dgpuj({
  repo: 'my-org/dgpuj',
  token: process.env.GITHUB_TOKEN,
  apiBase: 'https://github.example.com/api/v3',
});
```

## Документація

- [Повна сторінка](https://harmoniya-net.github.io/opys/uk/plugins/dgpuj): кожен параметр, і чому він так працює
- [Формат](https://harmoniya-net.github.io/opys/uk/format/): з чого складається маніфест

Частина [opys](https://github.com/harmoniya-net/opys). Також експортується з [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
