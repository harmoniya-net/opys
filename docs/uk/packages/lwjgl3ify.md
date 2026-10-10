# @opys/lwjgl3ify

[![npm](https://img.shields.io/npm/v/@opys/lwjgl3ify.svg)](https://www.npmjs.com/package/@opys/lwjgl3ify)

lwjgl3ify для opys. `lwjgl3ify()` додає Minecraft 1.7.10 з
[lwjgl3ify](https://github.com/GTNewHorizons/lwjgl3ify): моди Forge 1.7.10
на сучасній Java. Використовуйте його замість `minecraft()`.

```sh
npm install -D @opys/dev @opys/lwjgl3ify @opys/java
```

## Приклад

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { java } from '@opys/java';
import { lwjgl3ify } from '@opys/lwjgl3ify';

export default defineConfig({
  output: 'game.opys',
  plugins: [lwjgl3ify({ version: '1.7.10' }), java({ version: '25' })],
  manifest: {
    command: '@lwjgl3ify.command',
    args: ['@lwjgl3ify.jvmArgs', '@lwjgl3ify.mainClass', '@lwjgl3ify.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Параметри

| Option                     | Що робить                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `version`                  | `'1.7.10'` (рекомендований випуск), `'1.7.10-latest'` або точний `'3.0.37'`.            |
| `unimixins`                | `false`, щоб лишити UniMixins поза збіркою, або `{ version, repo }`, щоб вибрати інший. |
| `source`                   | Дзеркало індексу збірок.                                                                |
| `repo`, `token`, `apiBase` | Звідки береться jar мода на GitHub, і токен для обмеження частоти запитів.              |
| `libraries`                | Бібліотеки для додавання або заміни, кожна `{ name, artifact }`.                        |

`version` визначається під час збирання, тож усе, крім точного
випуску, може змінитися між двома збираннями.

## Що він додає

Усе, що додає [`@opys/minecraft-vanilla`](https://www.npmjs.com/package/@opys/minecraft-vanilla#what-it-adds)
(гру, її змінні), з такими відмінностями.

### Файли · два моди в `mods/`

Крім бібліотек: мод lwjgl3ify і UniMixins, без якого він
не стартує.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${game_directory}/mods/lwjgl3ify-3.0.37.jar",
  "source": { "url": "https://github.com/GTNewHorizons/lwjgl3ify/releases/download/3.0.37/lwjgl3ify-3.0.37.jar" },
  "size": 8266971,
  "integrity": { "sha256": "3c5af555d62eb9b7f4196adea94cb4cbd4c8efe3e1d512f83537aa88d9d5211e" }
},
{
  "path": "${game_directory}/mods/+unimixins-all-1.7.10-0.3.2.jar",
  "source": { "url": "https://github.com/LegacyModdingMC/UniMixins/releases/download/0.3.2/%2Bunimixins-all-1.7.10-0.3.2.jar" },
  "size": 5520080,
  "integrity": { "sha256": "2687b776c8503e0b60cd8413cf70eaabb836c19f9fc726280ef61d6612257034" }
}
```

### Запуск

Довгий рядок. Гра 2014 року на сучасній Java потребує багато
дверей, відчинених вручну.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"launch": {
  // '@lwjgl3ify.command'
  "command": "${java_bin}",
  "args": [
    // '@lwjgl3ify.jvmArgs'
    "-Djava.library.path=${natives_directory}",
    "-cp",
    "${classpath}",
    "-Djava.system.class.loader=com.gtnewhorizons.retrofuturabootstrap.RfbSystemClassLoader",
    "--add-opens", "java.base/java.io=ALL-UNNAMED",
    "--add-opens", "java.base/java.lang=ALL-UNNAMED"
    // … ще близько сорока --add-opens
    // '@lwjgl3ify.mainClass'
    "com.gtnewhorizons.retrofuturabootstrap.MainStartOnFirstThread",
    // '@lwjgl3ify.gameArgs'
    "--username", "${auth_player_name}",
    // … решта ігрових аргументів 1.7.10, потім:
    "--tweakClass", "cpw.mods.fml.common.launcher.FMLTweaker"
  ],
  "workdir": "${game_directory}"
}
```

### Змінні

Ті самі імена, що у ванілі. `classpath` тримає бібліотеки
завантажувача перед бібліотеками гри.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"vars": {
  "classpath": [/* бібліотеки завантажувача, бібліотеки гри, потім jar гри */]
  // … решта, як у ванілі
}
```

## Кожен параметр

Кожен параметр, у кожному способі його використання.

```js
// рекомендований випуск для версії Minecraft або найновіший, якщо його немає
lwjgl3ify({ version: '1.7.10' });
lwjgl3ify({ version: '1.7.10-recommended' });

// найновіший випуск
lwjgl3ify({ version: '1.7.10-latest' });

// один точний випуск: той самий у кожному збиранні збірки
lwjgl3ify({ version: '3.0.37' });

// бібліотека, якої гра не постачає, або виправлена копія тієї, яку постачає
lwjgl3ify({
  version: '1.7.10',
  libraries: [
    // jar поруч із конфігурацією: він подорожує всередині бандла
    {
      name: 'com.google.code.gson:gson:2.11.0',
      artifact: {
        path: 'com/google/code/gson/gson/2.11.0/gson-2.11.0.jar',
        source: { file: 'libs/gson-2.11.0.jar' },
      },
    },
    // jar за посиланням, лише для однієї ОС
    {
      name: 'com.example:native-helper:1.0',
      artifact: {
        path: 'com/example/native-helper/1.0/native-helper-1.0.jar',
        source: { url: 'https://example.com/native-helper-1.0.jar' },
        integrity: { sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709' },
        rules: 'allow.os.windows',
      },
    },
  ],
});

// дзеркала для мережі, яка не може досягти типових адрес
lwjgl3ify({
  version: '1.7.10',
  source: 'https://mirror.example.com/lwjgl3ify',
});

// інший UniMixins або жодного
lwjgl3ify({ version: '1.7.10', unimixins: { version: '0.3.2' } });
lwjgl3ify({ version: '1.7.10', unimixins: { repo: 'my-org/UniMixins' } });
lwjgl3ify({ version: '1.7.10', unimixins: false });

// jar мода з форка, з токеном GitHub для обмеження частоти запитів
lwjgl3ify({
  version: '1.7.10',
  repo: 'my-org/lwjgl3ify',
  token: process.env.GITHUB_TOKEN,
  apiBase: 'https://github.example.com/api/v3',
});
```

## Документація

- [Повна сторінка](https://harmoniya-net.github.io/opys/uk/plugins/lwjgl3ify): кожен параметр, і чому він працює саме так
- [Формат](https://harmoniya-net.github.io/opys/uk/format/): з чого складається маніфест

Частина [opys](https://github.com/harmoniya-net/opys). Також експортується з [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
