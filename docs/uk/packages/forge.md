# @opys/forge

[![npm](https://img.shields.io/npm/v/@opys/forge.svg)](https://www.npmjs.com/package/@opys/forge)

Forge для opys. `forge()` додає гру і збірку Forge для будь-якої
версії Minecraft від 1.1. Використовуйте його замість `minecraft()`.

```sh
npm install -D @opys/dev @opys/forge @opys/java
```

## Приклад

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { forge } from '@opys/forge';
import { java } from '@opys/java';

export default defineConfig({
  output: 'game.opys',
  plugins: [forge({ version: '1.20.1' }), java({ version: '17' })],
  manifest: {
    command: '@forge.command',
    args: ['@forge.jvmArgs', '@forge.mainClass', '@forge.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Параметри

| Option         | Що робить                                                                          |
| -------------- | ---------------------------------------------------------------------------------- |
| `version`      | `'1.20.1'` (рекомендована збірка), `'1.20.1-latest'` або точна `'1.20.1-47.4.10'`. |
| `source`       | Дзеркало індексу збірок.                                                           |
| `manifestBase` | Дзеркало списку версій від Mojang.                                                 |
| `libraries`    | Бібліотеки для додавання або заміни, кожна `{ name, artifact }`.                   |

`version` визначається під час збирання, тож усе, крім точної
збірки, може змінитися між двома збираннями.

## Що він додає

Усе, що додає [`@opys/minecraft-vanilla`](https://www.npmjs.com/package/@opys/minecraft-vanilla#what-it-adds)
(гру, її змінні), з такими відмінностями.

### Файли · бібліотеки Forge

Власні jar Forge. Бібліотека гри, яку замінює Forge, вилучається.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${library_directory}/cpw/mods/modlauncher/10.0.9/modlauncher-10.0.9.jar",
  "source": { "url": "https://maven.minecraftforge.net/cpw/mods/modlauncher/10.0.9/modlauncher-10.0.9.jar" },
  "size": 130343,
  "integrity": { "sha1": "06d9443f56f50bb85cea383686ff9c867391458b" }
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
  // '@forge.command'
  "command": "${java_bin}",
  "args": [
    // '@forge.jvmArgs'
    // … ванільні аргументи JVM, потім:
    "-cp",
    "${classpath}",
    "-Dhorno.librariesDir=${library_directory}",
    "-Dhorno.installer=${library_directory}/net/minecraftforge/forge/1.20.1-47.4.10/forge-1.20.1-47.4.10-installer.jar",
    "-Dhorno.installerUrl=https://maven.minecraftforge.net/…/forge-1.20.1-47.4.10-installer.jar",
    "-Dhorno.installerSha1=66bfea9963bfa60d88bab6b2750e74a958392715",
    "-Dhorno.minecraft=${library_directory}/com/mojang/minecraft/1.20.1/minecraft-1.20.1-client.jar",
    // '@forge.mainClass'
    "net.harmoniya.horno.Main",
    // '@forge.gameArgs'
    "--username", "${auth_player_name}",
    // … ванільні ігрові аргументи, потім:
    "--launchTarget", "forgeclient",
    "--fml.forgeVersion", "47.4.10",
    "--fml.mcVersion", "1.20.1"
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
forge({ version: '1.20.1' });
forge({ version: '1.20.1-recommended' });

// найновіша збірка
forge({ version: '1.20.1-latest' });

// одна точна збірка: та сама в кожному збиранні збірки
forge({ version: '1.20.1-47.4.10' });

// бібліотека, якої гра не постачає, або виправлена копія тієї, яку постачає
forge({
  version: '1.20.1',
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
forge({
  version: '1.20.1',
  source: 'https://mirror.example.com/forge',
  manifestBase: 'https://mirror.example.com/mc/game/version_manifest_v2.json',
});
```

## Документація

- [Повна сторінка](https://harmoniya-net.github.io/opys/uk/plugins/forge): кожен параметр, і чому він працює саме так
- [Формат](https://harmoniya-net.github.io/opys/uk/format/): з чого складається маніфест

Частина [opys](https://github.com/harmoniya-net/opys). Також експортується з [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
