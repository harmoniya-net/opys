# @opys/minecraft-vanilla

[![npm](https://img.shields.io/npm/v/@opys/minecraft-vanilla.svg)](https://www.npmjs.com/package/@opys/minecraft-vanilla)

Ванільний Minecraft для opys. `minecraft()` додає гру так, як її
постачає Mojang, без завантажувача модів.

```sh
npm install -D @opys/dev @opys/minecraft-vanilla @opys/java
```

## Приклад

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { java } from '@opys/java';
import { minecraft } from '@opys/minecraft-vanilla';

export default defineConfig({
  output: 'game.opys',
  plugins: [minecraft({ version: '1.21.1' }), java({ version: '21' })],
  manifest: {
    command: '@minecraft.command',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Параметри

| Option         | Що робить                                                        |
| -------------- | ---------------------------------------------------------------- |
| `version`      | Версія Minecraft. Якщо пропущено: поточний випуск.               |
| `libraries`    | Бібліотеки для додавання або заміни, кожна `{ name, artifact }`. |
| `manifestBase` | Дзеркало списку версій від Mojang.                               |

## Що він додає

`opys build` перетворює плагін на ці частини маніфесту.

### Файли · jar гри

Один файл, зафіксований хешем, який публікує Mojang.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${version_dir}/client.jar",
  "source": { "url": "https://piston-data.mojang.com/v1/objects/30c7…/client.jar" },
  "size": 26836906,
  "integrity": { "sha1": "30c73b1c5da787909b2f73340419fdf13b9def88" }
}
```

### Файли · бібліотеки

Близько сотні jar. Той, що має нативний код, має `rules`
і розпаковується.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${library_directory}/org/lwjgl/lwjgl-freetype/3.3.3/lwjgl-freetype-3.3.3-natives-linux.jar",
  "source": { "url": "https://libraries.minecraft.net/org/lwjgl/…-natives-linux.jar" },
  "size": 1245129,
  "rules": "allow.os.linux",
  "integrity": { "sha1": "149070a5480900347071b7074779531f25a6e3dc" },
  "extract": { "into": "${natives_directory}", "clean": true, "excludes": ["META-INF/"] }
}
```

### Файли · ресурси

Звуки, текстури, мови: кілька тисяч малих файлів.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${assets_root}/objects/b6/b62ca8ec10d07e6bf5ac8dae0c8c1d2e6a1e3356",
  "source": { "url": "https://resources.download.minecraft.net/b6/b62c…" },
  "size": 9101,
  "integrity": { "sha1": "b62ca8ec10d07e6bf5ac8dae0c8c1d2e6a1e3356" },
  "metadata": { "name": "icons/icon_128x128.png" }
}
```

### Запуск

Увесь командний рядок, як чотири частини, які ви складаєте
за порядком.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"launch": {
  // '@minecraft.command'
  "command": "${java_bin}",
  "args": [
    // '@minecraft.jvmArgs'
    { "rules": "allow.os.osx", "value": ["-XstartOnFirstThread"] },
    "-Djava.library.path=${natives_directory}",
    // … ще кілька
    "-cp",
    "${classpath}",
    // '@minecraft.mainClass'
    "net.minecraft.client.main.Main",
    // '@minecraft.gameArgs'
    "--username", "${auth_player_name}",
    "--version", "${version_name}",
    "--gameDir", "${game_directory}",
    "--assetsDir", "${assets_root}",
    "--uuid", "${auth_uuid}",
    "--accessToken", "${auth_access_token}",
    // … ще кілька
    { "rules": "allow.features.is_demo_user", "value": ["--demo"] }
  ],
  "workdir": "${game_directory}"
}
```

### Змінні

Теки, усі під `root`, та імена, яких гра очікує для гравця.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"vars": {
  "root": ".",
  "game_directory": "${root}/",                       // збереження, моди, налаштування
  "library_directory": "${root}/libraries",
  "assets_root": "${root}/assets",
  "version_dir": "${root}/versions/${version_name}",  // jar гри
  "natives_directory": "${version_dir}/natives",

  "auth_player_name": "${username}",
  "auth_uuid": "${uuid}",
  "auth_access_token": "${token}",

  "version_name": "1.21.1",
  "classpath": [/* кожна бібліотека, потім jar гри, для кожної ОС */]
  // … і ще кілька, на які посилаються аргументи гри
}
```

`root`, `username`, `uuid` і `token` лишаються відкритими: вони різні
для кожного гравця. Задайте їх у `run`, через `--var` або з лаунчера.

## Кожен параметр

Кожен параметр, у кожному способі його використання.

```js
// одна версія
minecraft({ version: '1.21.1' });

// поточний випуск на день збирання
minecraft();

// бібліотека, якої гра не постачає, або виправлена копія тієї, яку постачає
minecraft({
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

// дзеркало списку версій від Mojang
minecraft({
  version: '1.21.1',
  manifestBase: 'https://mirror.example.com/mc/game/version_manifest_v2.json',
});
```

## Документація

- [Повна сторінка](https://harmoniya-net.github.io/opys/uk/plugins/minecraft): кожен параметр, і чому він працює саме так
- [Формат](https://harmoniya-net.github.io/opys/uk/format/): з чого складається маніфест

Частина [opys](https://github.com/harmoniya-net/opys). Також експортується з [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
