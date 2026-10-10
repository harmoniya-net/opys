# @opys/cleanroom

[![npm](https://img.shields.io/npm/v/@opys/cleanroom.svg)](https://www.npmjs.com/package/@opys/cleanroom)

Cleanroom для opys. `cleanroom()` додає Minecraft 1.12.2 з
[Cleanroom](https://github.com/CleanroomMC/Cleanroom): моди Forge 1.12.2
на сучасній Java. Використовуйте його замість `minecraft()`.

```sh
npm install -D @opys/dev @opys/cleanroom @opys/java
```

## Приклад

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { cleanroom } from '@opys/cleanroom';
import { java } from '@opys/java';

export default defineConfig({
  output: 'game.opys',
  plugins: [cleanroom({ version: '1.12.2' }), java({ version: '25' })],
  manifest: {
    command: '@cleanroom.command',
    args: ['@cleanroom.jvmArgs', '@cleanroom.mainClass', '@cleanroom.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Параметри

| Option      | Що робить                                                                          |
| ----------- | ---------------------------------------------------------------------------------- |
| `version`   | `'1.12.2'` (рекомендований випуск), `'1.12.2-latest'` або точний `'0.6.13-alpha'`. |
| `source`    | Дзеркало індексу збірок.                                                           |
| `libraries` | Бібліотеки для додавання або заміни, кожна `{ name, artifact }`.                   |

`version` визначається під час збирання, тож усе, крім точного
випуску, може змінитися між двома збираннями.

## Що він додає

Усе, що додає [`@opys/minecraft-vanilla`](https://www.npmjs.com/package/@opys/minecraft-vanilla#what-it-adds)
(гру, її змінні), з такими відмінностями.

### Файли · гра і бібліотеки Cleanroom

Гра 1.12.2, у якій LWJGL 2 замінено на LWJGL 3. Старий
взагалі не встановлюється.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${library_directory}/com/cleanroommc/cleanroom/0.6.13-alpha/cleanroom-0.6.13-alpha.jar",
  "source": { "url": "https://github.com/CleanroomMC/Cleanroom/releases/download/0.6.13-alpha/cleanroom-0.6.13-alpha-universal.jar" },
  "size": 6505649,
  "integrity": { "sha1": "8d59eda7065f26fc0c1bbd3a9fa9f272ff89917f" }
}
```

### Запуск

Короткий рядок, запущений через власний головний клас Cleanroom.
Перед грою нічого не виконується.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"launch": {
  // '@cleanroom.command'
  "command": "${java_bin}",
  "args": [
    // '@cleanroom.jvmArgs'
    "-Djava.library.path=${natives_directory}",
    "-cp",
    "${classpath}",
    // '@cleanroom.mainClass'
    "top.outlands.foundation.boot.Foundation",
    // '@cleanroom.gameArgs'
    "--username", "${auth_player_name}",
    // … решта ігрових аргументів 1.12.2, потім:
    "--tweakClass", "net.minecraftforge.fml.common.launcher.FMLTweaker",
    "--versionType", "Forge"
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
cleanroom({ version: '1.12.2' });
cleanroom({ version: '1.12.2-recommended' });

// найновіший випуск
cleanroom({ version: '1.12.2-latest' });

// один точний випуск: той самий у кожному збиранні збірки
cleanroom({ version: '0.6.13-alpha' });

// бібліотека, якої гра не постачає, або виправлена копія тієї, яку постачає
cleanroom({
  version: '1.12.2',
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
cleanroom({
  version: '1.12.2',
  source: 'https://mirror.example.com/cleanroom',
});
```

## Документація

- [Повна сторінка](https://harmoniya-net.github.io/opys/uk/plugins/cleanroom): кожен параметр, і чому він працює саме так
- [Формат](https://harmoniya-net.github.io/opys/uk/format/): з чого складається маніфест

Частина [opys](https://github.com/harmoniya-net/opys). Також експортується з [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
