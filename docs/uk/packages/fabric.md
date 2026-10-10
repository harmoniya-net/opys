# @opys/fabric

[![npm](https://img.shields.io/npm/v/@opys/fabric.svg)](https://www.npmjs.com/package/@opys/fabric)

Fabric для opys. `fabric()` додає гру і завантажувач Fabric
для будь-якої версії Minecraft, яку підтримує Fabric.
Використовуйте його замість `minecraft()`.

```sh
npm install -D @opys/dev @opys/fabric @opys/java
```

## Приклад

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { fabric } from '@opys/fabric';
import { java } from '@opys/java';

export default defineConfig({
  output: 'game.opys',
  plugins: [fabric({ version: '1.21.4' }), java({ version: '21' })],
  manifest: {
    command: '@fabric.command',
    args: ['@fabric.jvmArgs', '@fabric.mainClass', '@fabric.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Параметри

| Option         | Що робить                                                                      |
| -------------- | ------------------------------------------------------------------------------ |
| `version`      | Версія Minecraft: `'1.21.4'`.                                                  |
| `loader`       | Версія завантажувача Fabric: `'0.16.10'`. Якщо пропущено: найновіша стабільна. |
| `source`       | Дзеркало Fabric Meta.                                                          |
| `manifestBase` | Дзеркало списку версій від Mojang.                                             |
| `libraries`    | Бібліотеки для додавання або заміни, кожна `{ name, artifact }`.               |

Без `loader` використовується найновіший стабільний, тож він може
змінитися між двома збираннями. Зафіксуйте його для збірки, яка
ніколи не змінюється.

## Що він додає

Усе, що додає [`@opys/minecraft-vanilla`](https://www.npmjs.com/package/@opys/minecraft-vanilla#what-it-adds)
(гру, її змінні), з такими відмінностями.

### Файли · бібліотеки Fabric

Завантажувач Fabric і те, що йому потрібно.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${library_directory}/net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar",
  "source": { "url": "https://maven.fabricmc.net/net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar" }
}
```

### Запуск

Ванільний командний рядок з головним класом Fabric. Перед грою
нічого не виконується: Fabric не має кроку встановлення.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"launch": {
  // '@fabric.command'
  "command": "${java_bin}",
  "args": [
    // '@fabric.jvmArgs'
    // … ванільні аргументи JVM, потім:
    "-cp",
    "${classpath}",
    "-DFabricMcEmu= net.minecraft.client.main.Main ",
    // '@fabric.mainClass'
    "net.fabricmc.loader.impl.launch.knot.KnotClient",
    // '@fabric.gameArgs'
    "--username", "${auth_player_name}",
    "--version", "${version_name}"
    // … ванільні ігрові аргументи, і жодного власного від Fabric
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
// найновіший стабільний завантажувач Fabric для версії Minecraft
fabric({ version: '1.21.4' });

// зафіксований завантажувач: той самий у кожному збиранні збірки
fabric({ version: '1.21.4', loader: '0.16.10' });

// бібліотека, якої гра не постачає, або виправлена копія тієї, яку постачає
fabric({
  version: '1.21.4',
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
fabric({
  version: '1.21.4',
  source: 'https://mirror.example.com/fabric-meta',
  manifestBase: 'https://mirror.example.com/mc/game/version_manifest_v2.json',
});
```

## Документація

- [Повна сторінка](https://harmoniya-net.github.io/opys/uk/plugins/fabric): кожен параметр, і чому він працює саме так
- [Формат](https://harmoniya-net.github.io/opys/uk/format/): з чого складається маніфест

Частина [opys](https://github.com/harmoniya-net/opys). Також експортується з [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
