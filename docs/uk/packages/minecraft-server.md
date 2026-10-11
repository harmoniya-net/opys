# @opys/minecraft-server

[![npm](https://img.shields.io/npm/v/@opys/minecraft-server.svg)](https://www.npmjs.com/package/@opys/minecraft-server)

Сервер Minecraft для opys. `server()` додає один jar сервера, закріплений
його хешем, і рядок, який його запускає.

```sh
npm install -D @opys/dev @opys/minecraft-server @opys/java
```

## Приклад

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { java } from '@opys/java';
import { server } from '@opys/minecraft-server';

export default defineConfig({
  output: 'server.opys',
  plugins: [server({ paper: '1.21.1' }), java({ version: '21' })],
  manifest: {
    command: '@server.command',
    args: ['-Xmx4G', '@server.jar', '@server.args'],
    workdir: '${root}',
  },
});
```

```sh
opys build
opys launch server.opys --var root=/srv/minecraft --feature eula
```

Сервер це один файл, або два для Forge і NeoForge. Свої бібліотеки він
завантажує сам під час першого запуску, тож їх немає в маніфесті, і opys їх
не перевіряє.

## Який сервер

Поле, що називає сервер, тримає його версію.

| Ви пишете                                               | Що ви отримуєте                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `server({ vanilla: '1.21.1' })`                         | Власний сервер Mojang.                                                  |
| `server()`                                              | Власний сервер Mojang, поточний реліз.                                  |
| `server({ paper: '1.21.1' })`                           | Paper, найновіша стабільна збірка.                                      |
| `server({ purpur: '1.21.1' })`                          | Purpur, найновіша збірка.                                               |
| `server({ fabric: '1.21.1' })`                          | Fabric, найновіший стабільний завантажувач.                             |
| `server({ forge: '1.21.1' })`                           | Forge, збірка, яку рекомендує Forge.                                    |
| `server({ neoforge: '21.1.259' })`                      | NeoForge. Його власна версія, не версія Minecraft.                      |
| `server({ jar: 'https://…/folia.jar' })`                | Будь-який jar за посиланням. Його завантажують один раз, щоб закріпити. |
| `server({ jar: 'build/spigot-1.21.1.jar' })`            | Будь-який jar на вашому диску. Він їде в бандлі.                        |
| `server({ installer: 'https://…/fork-installer.jar' })` | Форк Forge чи NeoForge, за його інсталятором.                           |

Spigot і CraftBukkit не мають завантаження: їх збирають через
[BuildTools](https://www.spigotmc.org/wiki/buildtools/) і передають jar
шляхом.

## Параметри

| Параметр | Для                        | Що робить                                      |
| -------- | -------------------------- | ---------------------------------------------- |
| `build`  | `paper`, `purpur`, `forge` | Одна точна збірка: `133`, `'52.1.16'`.         |
| `loader` | `fabric`                   | Одна точна версія завантажувача.               |
| `apis`   | будь-який                  | Дзеркала: `{ paper: 'https://…', mojang: … }`. |

Сервер приймає свої параметри і жодних чужих. `server({ paper: '1.21.1',
loader: '0.19.5' })` відхиляється: завантажувач належить Fabric. Два сервери
одразу, `server({ paper, fabric })`, теж відхиляються.

Закріплюйте збірку для збірки, яку публікуєте. Без `build` чи `loader` той
самий конфіг наступного місяця може дати новіший сервер.

## Пошук версій

Три функції, для конфігу або для панелі, де хтось обирає.

```js
import {
  serverVersions,
  serverBuilds,
  resolveServer,
} from '@opys/minecraft-server';

await serverVersions('paper'); // ['26.3', '26.2', '1.21.11', …]
await serverBuilds('paper', '1.21.1'); // ['133', '132', '131', …]

await resolveServer({ paper: '1.21.1' });
// {
//   pinned: { paper: '1.21.1', build: '133' },
//   label: 'Paper 1.21.1 build 133',
//   files: [{ path: '${root}/server.jar', source: { url }, size, integrity }],
// }
```

`pinned` це те саме, що ви передаєте в `server()`, де вже нічого не лишено
на «найновіше». Вставте його у свій конфіг, щоб зберегти саме цей сервер.

| Сервер     | `serverVersions`             | `serverBuilds`            |
| ---------- | ---------------------------- | ------------------------- |
| `vanilla`  | Релізи Mojang.               | Немає.                    |
| `paper`    | Версії Minecraft, стабільні. | Номери стабільних збірок. |
| `purpur`   | Версії Minecraft, стабільні. | Номери збірок.            |
| `fabric`   | Версії Minecraft, стабільні. | Версії завантажувача.     |
| `forge`    | Версії Minecraft.            | Збірки Forge.             |
| `neoforge` | Версії NeoForge, стабільні.  | Немає.                    |

Списки йдуть від найновішого. Передрелізу в списку немає, але він працює,
якщо його назвати: `server({ neoforge: '26.3.0.69-beta' })`.

## Forge і NeoForge

Вони публікують інсталятор, а не сервер: інсталятор латає Minecraft на тому
комп'ютері, де працює. opys додає два файли, інсталятор і
[ServerStarterJar](https://github.com/neoforged/ServerStarterJar) від
NeoForge, який запускає інсталятор, а потім стартує сервер.

- Перший запуск встановлює. Це займає близько пів хвилини й завантажує те,
  що потрібно інсталятору; opys ці файли не перевіряє.
- **Forge зупиняється після встановлення.** Запустіть його ще раз. NeoForge
  встановлює і стартує за один раз.
- Перехід на новішу збірку встановлює її під час наступного запуску, у тій
  самій теці.
- Запускайте з теки сервера: залишайте `workdir: '${root}'`.
- Forge потребує Minecraft 1.17 або новішого. Старіший відхиляється під час
  збирання.

## EULA

Сервер Minecraft не стартує, доки в `eula.txt` не написано `eula=true`. Це
ваша згода з [EULA Mojang](https://aka.ms/MinecraftEULA).

Плагін пише цей файл лише тоді, коли ввімкнено прапорець `eula`, а
прапорець дають там, де сервер встановлюють:

```sh
opys launch server.opys --var root=/srv/minecraft --feature eula
```

Коли запускаєте зі свого конфігу, скажіть це в `run`:

```js
run: (manifest) => ({
  manifest: { vars: { ...manifest.vars, root: '/srv/minecraft' } },
  features: ['eula'],
}),
```

- Параметра `eula: true` немає. Параметр поклав би згоду в бандл, і той,
  кому ви дали бандл, погодився б, хоча його не питали.
- Без прапорця нічого не пишеться. Сервер зупиняється і питає, як і без
  opys.
- Для панелі чи лаунчера запропонуйте це як прапорець у налаштуваннях:

```js
options: options().feature('eula').title('I agree to the Minecraft EULA'),
```

## Ваш світ і налаштування

`server.properties`, світ, `plugins/` і `mods/` не входять у маніфест.
Повторне встановлення їх не чіпає.

Щоб постачати власні налаштування чи плагіни, додайте їх через
[`files()`](https://harmoniya-net.github.io/opys/uk/plugins/files) або
[`links()`](https://harmoniya-net.github.io/opys/uk/plugins/links):

```js
links({
  links: ['https://modrinth.com/plugin/luckperms/version/v5.4.145-bukkit'],
  to: (file) => '${root}/plugins/' + file.filename,
}),
```

Файл, доданий так, належить маніфесту: кожне встановлення повертає його
таким, яким його зібрали.

## Що він додає

`opys build` перетворює плагін на ці частини маніфесту.

### Файли

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${root}/server.jar",
  "source": { "url": "https://fill-data.papermc.io/v1/objects/39bd…/paper-1.21.1-133.jar" },
  "size": 49394394,
  "integrity": { "sha256": "39bd8c00b9e18de91dcabd3cc3dcfa5328685a53b7187a2f63280c22e2d287b9" }
},
{
  "path": "${root}/eula.txt",
  "source": { "blob": "…" },
  "rules": "allow.features.eula"
}
```

### Запуск

| Ви пишете           | У маніфесті                      |
| ------------------- | -------------------------------- |
| `'@server.command'` | `"${java_bin}"`                  |
| `'@server.jar'`     | `"-jar"`, `"${root}/server.jar"` |
| `'@server.args'`    | `"nogui"`                        |

Для Forge, NeoForge та `installer` у `'@server.jar'` є ще
`"--installer-force"`, прапорець стартера для встановлення новішої збірки.

Ваші прапорці JVM ідуть перед `'@server.jar'`, а прапорці самого сервера
після нього:

```js
args: ['-Xms4G', '-Xmx4G', '@server.jar', '@server.args', '--port', '25566'],
```

### Змінні

| Змінна | Значення | Що це                                             |
| ------ | -------- | ------------------------------------------------- |
| `root` | `.`      | Тека сервера. Задайте її через `--var` або `run`. |

## Java

Плагін не постачає Java. Додайте [`java()`](https://www.npmjs.com/package/@opys/java):

```js
java({ version: '21' }); // JDK у маніфесті бандла
java({ system: true }); // власна Java комп'ютера
```

У Windows запускайте з `--feature java_console`. Без нього `java()` обирає
`javaw`, а в нього немає консолі, куди вводити команди сервера.

## Документація

- [Формат](https://harmoniya-net.github.io/opys/uk/format/): з чого складається маніфест
- [`run`](https://harmoniya-net.github.io/opys/uk/basics/config#run): те, що знає лише комп'ютер запуску

Частина [opys](https://github.com/harmoniya-net/opys). Також експортується з [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
