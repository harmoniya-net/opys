# @opys/minecraft

[![npm](https://img.shields.io/npm/v/@opys/minecraft.svg)](https://www.npmjs.com/package/@opys/minecraft)

Кожен плагін Minecraft для opys в одному імпорті. Власного коду він
не має: він реекспортує пакети нижче.

```sh
npm install -g @opys/cli
npm install -D @opys/dev @opys/minecraft
```

## Приклад

```js
// opys.config.mjs
import { defineConfig, userDataDir } from '@opys/dev';
import { forge, java } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [forge({ version: '1.20.1' }), java({ version: '17' })],
  manifest: {
    command: '@forge.command',
    args: ['@forge.jvmArgs', '@forge.mainClass', '@forge.gameArgs'],
    workdir: '${game_directory}',
  },
  run: (manifest) => ({
    vars: {
      ...manifest.vars,
      root: userDataDir('my-pack'),
      username: 'Player',
      uuid: '00000000-0000-0000-0000-000000000001',
      token: '0',
    },
  }),
});
```

Потім `opys launch`.

## Що всередині

### Гра

Виберіть один. Кожен приносить гру, її бібліотеки і її командний рядок.

| Плагін      | Що встановлює                       | Пакет                                                                              |
| ----------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| `minecraft` | Гру без завантажувача модів.        | [`@opys/minecraft-vanilla`](https://www.npmjs.com/package/@opys/minecraft-vanilla) |
| `forge`     | Forge.                              | [`@opys/forge`](https://www.npmjs.com/package/@opys/forge)                         |
| `neoforge`  | NeoForge.                           | [`@opys/neoforge`](https://www.npmjs.com/package/@opys/neoforge)                   |
| `fabric`    | Fabric.                             | [`@opys/fabric`](https://www.npmjs.com/package/@opys/fabric)                       |
| `cleanroom` | Cleanroom: 1.12.2 на сучасній Java. | [`@opys/cleanroom`](https://www.npmjs.com/package/@opys/cleanroom)                 |
| `lwjgl3ify` | lwjgl3ify: 1.7.10 на сучасній Java. | [`@opys/lwjgl3ify`](https://www.npmjs.com/package/@opys/lwjgl3ify)                 |

### Java

| Плагін  | Що встановлює                                        | Пакет                                                      |
| ------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| `java`  | JDK, щоб гравцям не треба було нічого встановлювати. | [`@opys/java`](https://www.npmjs.com/package/@opys/java)   |
| `dgpuj` | Прокладку, що вибирає дискретну відеокарту.          | [`@opys/dgpuj`](https://www.npmjs.com/package/@opys/dgpuj) |

### Моди та інші файли

| Плагін              | Що встановлює                                     | Пакет                                                                |
| ------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| `modrinth`          | Файли з Modrinth, за версією.                     | [`@opys/modrinth`](https://www.npmjs.com/package/@opys/modrinth)     |
| `modrinthModpack`   | Цілий модпак Modrinth, разом із завантажувачем.   | [`@opys/modrinth`](https://www.npmjs.com/package/@opys/modrinth)     |
| `curseforge`        | Файли з CurseForge, за файлом.                    | [`@opys/curseforge`](https://www.npmjs.com/package/@opys/curseforge) |
| `curseforgeModpack` | Цілий модпак CurseForge, разом із завантажувачем. | [`@opys/curseforge`](https://www.npmjs.com/package/@opys/curseforge) |
| `links`             | Будь-який файл, на який у вас є посилання.        | [`@opys/links`](https://www.npmjs.com/package/@opys/links)           |

`files`, для теки на вашому диску, у
[`@opys/dev`](https://www.npmjs.com/package/@opys/dev).

### Акаунти і сервери

| Експорт       | Що робить                                              | Пакет                                                                                    |
| ------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `authliberty` | Вказує гру на ваші власні сервери авторизації.         | [`@opys/authliberty`](https://www.npmjs.com/package/@opys/authliberty)                   |
| `bifrost`     | Підписує токен входу. Функція, вжита в `run`.          | [`@opys/bifrost`](https://www.npmjs.com/package/@opys/bifrost)                           |
| `serverlist`  | Заповнює список серверів для багатокористувацької гри. | [`@opys/minecraft-serverlist`](https://www.npmjs.com/package/@opys/minecraft-serverlist) |

## Один імпорт чи кілька

Обидва працюють, і це той самий код.

```js
import { forge, java, modrinth } from '@opys/minecraft';
```

```js
import { forge } from '@opys/forge';
import { java } from '@opys/java';
import { modrinth } from '@opys/modrinth';
```

Дві назви тут відрізняються від пакетів, звідки вони походять:

| Тут                 | У власному пакеті                                              |
| ------------------- | -------------------------------------------------------------- |
| `bifrost`           | `resolveBifrost` у `@opys/bifrost`. Обидві назви працюють тут. |
| `DEFAULT_PLATFORMS` | Тут це `@opys/java`. `@opys/dgpuj` має власний.                |

## Кожен плагін

Кожен плагін у найчастішому написанні. Кожен параметр у власному
README плагіна.

<!-- prettier-ignore -->
```js
// гра: один із
minecraft({ version: '1.21.1' });
forge({ version: '1.20.1' });
neoforge({ version: '1.21.1' });
fabric({ version: '1.21.1' });
cleanroom({ version: '1.12.2' });
lwjgl3ify({ version: '1.7.10' });

// java
java({ version: '21' });
dgpuj();

// моди та інші файли
modrinth({ versions: ['Xbc0uyRg'], to: (file) => '${game_directory}/mods/' + file.filename });
curseforge({ files: [4835191], to: (file) => '${game_directory}/mods/' + file.filename, token });
links({ links: ['https://github.com/owner/repo/releases/download/v1.0/mod.jar'], to: (file) => '${game_directory}/mods/' + file.filename });
modrinthModpack({ pack: 'xVcA1pSL' });
curseforgeModpack({ file: 1040985, token });

// акаунти і сервери
authliberty({ version: 'latest', hosts: { auth: 'https://auth.example.com' } });
serverlist({ servers: [{ name: 'My server', ip: 'play.example.com' }] });
bifrost({ privateKey, username: 'Player', uuid: '00000000-0000-0000-0000-000000000001' }); // у `run`
```

## Документація

- [Вступ](https://harmoniya-net.github.io/opys/uk/basics/intro): перша збірка
- [Усі плагіни](https://harmoniya-net.github.io/opys/uk/plugins/): по сторінці на кожен

Частина [opys](https://github.com/harmoniya-net/opys).
