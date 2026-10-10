# @opys/neoforge

[![npm](https://img.shields.io/npm/v/@opys/neoforge.svg)](https://www.npmjs.com/package/@opys/neoforge)

NeoForge для opys. `neoforge()` додає гру і збірку NeoForge
для Minecraft 1.20.2 і новіших. Використовуйте його
замість `minecraft()`.

```sh
npm install -D @opys/dev @opys/neoforge @opys/java
```

## Приклад

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { java } from '@opys/java';
import { neoforge } from '@opys/neoforge';

export default defineConfig({
  output: 'game.opys',
  plugins: [neoforge({ version: '1.21.1' }), java({ version: '21' })],
  manifest: {
    command: '@neoforge.command',
    args: ['@neoforge.jvmArgs', '@neoforge.mainClass', '@neoforge.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Параметри

| Option         | Що робить                                                                    |
| -------------- | ---------------------------------------------------------------------------- |
| `version`      | `'1.21.1'` (рекомендована збірка), `'1.21.1-latest'` або точна `'21.1.172'`. |
| `source`       | Дзеркало індексу збірок.                                                     |
| `manifestBase` | Дзеркало списку версій від Mojang.                                           |
| `libraries`    | Бібліотеки для додавання або заміни, кожна `{ name, artifact }`.             |

`version` визначається під час збирання, тож усе, крім точної
збірки, може змінитися між двома збираннями.

## Що він додає

Усе, що додає [`@opys/minecraft-vanilla`](https://www.npmjs.com/package/@opys/minecraft-vanilla#what-it-adds)
(гру, її змінні), з такими відмінностями.

### Файли · бібліотеки NeoForge

Власні jar NeoForge.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${library_directory}/cpw/mods/modlauncher/11.0.5/modlauncher-11.0.5.jar",
  "source": { "url": "https://maven.neoforged.net/releases/cpw/mods/modlauncher/11.0.5/modlauncher-11.0.5.jar" },
  "size": 116486,
  "integrity": { "sha1": "b8f0d49294f733fdb6173931b263553e943dc950" }
}
```

### Запуск

Ванільний командний рядок, запущений через **horno**: малий
помічник, який завершує встановлення завантажувача на комп’ютері
гравця, а потім запускає гру.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"launch": {
  // '@neoforge.command'
  "command": "${java_bin}",
  "args": [
    // '@neoforge.jvmArgs'
    // … ванільні аргументи JVM, потім:
    "-cp",
    "${classpath}",
    "-Dhorno.librariesDir=${library_directory}",
    "-Dhorno.installer=${library_directory}/net/neoforged/neoforge/21.1.256/neoforge-21.1.256-installer.jar",
    "-Dhorno.installerUrl=https://maven.neoforged.net/releases/…/neoforge-21.1.256-installer.jar",
    "-Dhorno.installerSha1=9d85f6e652996e83f05ead32120317e1ef056590",
    "-Dhorno.minecraft=${library_directory}/com/mojang/minecraft/1.21.1/minecraft-1.21.1-client.jar",
    // '@neoforge.mainClass'
    "net.harmoniya.horno.Main",
    // '@neoforge.gameArgs'
    "--username", "${auth_player_name}",
    // … ванільні ігрові аргументи, потім:
    "--fml.neoForgeVersion", "21.1.256",
    "--fml.mcVersion", "1.21.1",
    "--launchTarget", "forgeclient"
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

Перший запуск повільніший, бо тоді horno виконує свою роботу.
`opys install` виконує її заздалегідь.

## Кожен параметр

Кожен параметр, у кожному способі його використання.

```js
// рекомендована збірка для версії Minecraft або найновіша, якщо її немає
neoforge({ version: '1.21.1' });
neoforge({ version: '1.21.1-recommended' });

// найновіша збірка
neoforge({ version: '1.21.1-latest' });

// одна точна збірка: та сама в кожному збиранні збірки
neoforge({ version: '21.1.172' });

// бібліотека, якої гра не постачає, або виправлена копія тієї, яку постачає
neoforge({
  version: '1.21.1',
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
neoforge({
  version: '1.21.1',
  source: 'https://mirror.example.com/neoforge',
  manifestBase: 'https://mirror.example.com/mc/game/version_manifest_v2.json',
});
```

## Документація

- [Повна сторінка](https://harmoniya-net.github.io/opys/uk/plugins/neoforge): кожен параметр, і чому він працює саме так
- [Формат](https://harmoniya-net.github.io/opys/uk/format/): з чого складається маніфест

Частина [opys](https://github.com/harmoniya-net/opys). Також експортується з [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
