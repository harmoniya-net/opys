# @opys/dev

[![npm](https://img.shields.io/npm/v/@opys/dev.svg)](https://www.npmjs.com/package/@opys/dev)

Чим пишуть конфігурацію opys: `defineConfig`, плагін `files`,
`options`, `userDataDir` і `definePlugin` для власного плагіна.

```sh
npm install -D @opys/dev @opys/minecraft
```

## Приклад

```js
// opys.config.mjs
import { defineConfig, files, options, userDataDir } from '@opys/dev';
import { forge, java } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    forge({ version: '1.20.1' }),
    java({ version: '17' }),
    files({ from: 'mods', to: (file) => '${game_directory}/mods/' + file.rel }),
  ],
  manifest: {
    command: '@forge.command',
    args: [
      '@forge.jvmArgs',
      '-Xmx${xmx}M',
      '@forge.mainClass',
      '@forge.gameArgs',
    ],
    workdir: '${game_directory}',
  },
  options: options()
    .slider('xmx', { min: 2048, max: 16384, step: 512, default: 4096 })
    .title('RAM')
    .unit('MB'),
  run: (manifest) => ({
    manifest: {
      vars: { ...manifest.vars, root: userDataDir('my-pack') },
    },
  }),
});
```

## Конфігурація

Що приймає `defineConfig`: об'єкт або функцію від `{ mode }`, яка
його повертає.

| Поле       | Що це                                                        |
| ---------- | ------------------------------------------------------------ |
| `plugins`  | З чого складається збірка. Жодних двох з однаковою назвою.   |
| `manifest` | Як її запустити, і все написане вручну. Див. нижче.          |
| `output?`  | Куди `opys build` записує бандл, відносно конфігурації.      |
| `options?` | Що може налаштувати гравець. Див. [Параметри](#параметри).   |
| `run?`     | Викликається на комп'ютері гравця при кожному `opys launch`. |

### manifest

| Поле         | Що це                                                                        |
| ------------ | ---------------------------------------------------------------------------- |
| `command`    | Програма для запуску: `'@forge.command'` або буквальне значення.             |
| `args`       | Її аргументи, по порядку.                                                    |
| `workdir?`   | Робоча тека для запуску.                                                     |
| `vars?`      | Ваші власні змінні. Вони перекривають змінні плагіна.                        |
| `envs?`      | Змінні середовища для гри.                                                   |
| `artifacts?` | Файли, написані вручну. Вони перекривають файли плагіна за тим самим шляхом. |
| `cleanup?`   | Що видалити після встановлення.                                              |

Усе під `manifest` копіюється в бандл. Шлях або облікові дані, які
належать одному комп'ютеру, пишуть у `run`, ніколи сюди.

### Рядок запуску

Рядок, що починається з `@`, замінюється тим, що пропонує плагін. Усе
інше передається як написано.

| Ви пишете          | Що означає                                              |
| ------------------ | ------------------------------------------------------- |
| `'@forge.jvmArgs'` | Група `jvmArgs` плагіна з назвою `forge`.               |
| `'-Xmx4G'`         | Аргумент `-Xmx4G`.                                      |
| `'\\@file'`        | Аргумент `@file`, для того, що справді так починається. |

- Посилання, яке нічого не називає, зупиняє збирання:
  `'@welcome.flags': 'welcome' exposes no 'flags' (it has: flag)`.
- З `defineConfig` неправильне посилання це також помилка типу у вашому редакторі.
- Плагін, використаний двічі, потребує двох назв: `forge({ … }).as('forge2')`.

### run

```js
run: (manifest) => ({ manifest: { vars: { ...manifest.vars, root: userDataDir('my-pack') } } }),
```

Викликається при кожному `opys launch` і `opys install` на комп'ютері,
який їх виконує. Те, що повертається, замінює ці поля маніфесту. Цього
немає в бандлі: лаунчер передає ті самі значення як `vars`.

## Параметри

Що гравець може змінити перед запуском. Вони записуються в бандл,
щоб лаунчер намалював екран налаштувань.

<!-- prettier-ignore -->
```js
options: options()
  .slider('xmx', { min: 1024, max: 16384, step: 512, default: 4096 })
    .title('RAM')
    .unit('MB')
  .select('preset', { low: 'Low', high: 'High' })
    .title('Graphics')
  .feature('custom_java', (o) => o
    .directory('java_home')
      .title('Java folder'))
    .title('Custom Java'),
```

| Вид                        | Встановлює | Його кроки               |
| -------------------------- | ---------- | ------------------------ |
| `.slider(name, range)`     | змінну     | `unit`                   |
| `.select(name, choices)`   | змінну     | `default`                |
| `.text(name)`              | змінну     | `placeholder`, `default` |
| `.file(name)`              | змінну     |                          |
| `.directory(name)`         | змінну     |                          |
| `.feature(name, options?)` | прапорець  | `default`, `options`     |

Кожен вид також має `title`, який йому потрібен, і `subtitle`. Повний
опис у [`@opys/bundle`](https://www.npmjs.com/package/@opys/bundle#options).

## files

Тека на вашому диску як файли збірки.

| Параметр | Що робить                                                         |
| -------- | ----------------------------------------------------------------- |
| `from`   | Тека відносно конфігурації.                                       |
| `to?`    | Куди встановлюється кожен файл. Типово: його шлях усередині теки. |
| `url?`   | Звідки завантажується кожен файл. Без нього файли вбудовуються.   |
| `hash?`  | З `url`: `'sha1'` або `'sha256'`, чим фіксується кожен файл.      |

`to` і `url` це функції від файла:

| Поле       | Для `mods/extra/tweaks.jar` у `from: 'mods'` |
| ---------- | -------------------------------------------- |
| `rel`      | `extra/tweaks.jar`                           |
| `dir`      | `extra`                                      |
| `filename` | `tweaks.jar`                                 |
| `abs`      | Повний шлях на вашому диску.                 |
| `size`     | Його розмір у байтах.                        |

### Файли · вбудовані

Без `url` кожен файл потрапляє в бандл.

<!-- prettier-ignore -->
```jsonc
// files({ from: 'mods', to: (file) => '${game_directory}/mods/' + file.rel })
// у маніфесті
{
  "path": "${game_directory}/mods/a.jar",
  "source": { "blob": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824" },
  "size": 5
}
```

### Файли · опубліковані в іншому місці

З `url` бандл тримає лише посилання і хеш.

<!-- prettier-ignore -->
```jsonc
// files({ from: 'mods', to: …, url: (file) => 'https://cdn.example.com/' + file.rel, hash: 'sha1' })
// у маніфесті
{
  "path": "${root}/a.jar",
  "source": { "url": "https://cdn.example.com/a.jar" },
  "size": 5,
  "integrity": { "sha1": "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d" }
}
```

## Зміна плагіна

Кожен плагін має ці методи. Кожен повертає новий плагін і змінює
лише його файли.

| Метод                        | Що робить                               |
| ---------------------------- | --------------------------------------- |
| `.exclude(match)`            | Відкидає файли, що збігаються.          |
| `.addRule(match, rules)`     | Додає їм правила: `'allow.os.windows'`. |
| `.removeIntegrity(match)`    | Встановлює їх без перевірки хешу.       |
| `.updateFirst(match, patch)` | Змінює поля першого збігу.              |
| `.updateMany(match, patch)`  | Змінює поля кожного збігу.              |
| `.as(name)`                  | Той самий плагін під іншою назвою.      |

`match` це glob-шаблон за шляхом встановлення, список glob-шаблонів
або функція від файла. `patch` це поля для зміни або функція, яка їх
повертає.

## Власний плагін

```js
import { definePlugin } from '@opys/dev';

export const welcome = ({ text }) =>
  definePlugin({
    name: 'welcome',
    build: (ctx) => ({
      artifacts: [
        {
          path: '${game_directory}/welcome.txt',
          source: { bytes: new TextEncoder().encode(text) },
        },
      ],
      vars: { greeting: text },
      launch: { flag: ['--welcome'] },
    }),
  });
```

`build` це єдиний хук. Він виконується під час збирання і повертає:

| Поле         | Що це                                                         |
| ------------ | ------------------------------------------------------------- |
| `artifacts?` | Файли для встановлення.                                       |
| `vars?`      | Змінні, якими володіє плагін.                                 |
| `launch?`    | Названі частини командного рядка, вжиті як `'@welcome.flag'`. |
| `envs?`      | Змінні середовища для гри.                                    |

`source` файла каже, де лежать його байти:

| Джерело     | Що це                                   | У бандлі           |
| ----------- | --------------------------------------- | ------------------ |
| `{ url }`   | Завантаження. Додайте йому `integrity`. | Посилання.         |
| `{ file }`  | Файл на комп'ютері збирання.            | Сам файл, як блоб. |
| `{ bytes }` | `Uint8Array`, який зробив плагін.       | Ці байти, як блоб. |

`build` отримує:

| Поле        | Що це                                                |
| ----------- | ---------------------------------------------------- |
| `configDir` | Каталог конфігурації, для відносних шляхів.          |
| `mode`      | `--mode` або назва команди.                          |
| `log`       | `log(scope, message)`, показується під час збирання. |

## Функції

| Функція                            | Що робить                                               |
| ---------------------------------- | ------------------------------------------------------- |
| `defineConfig(config)`             | Повертає конфігурацію, з перевіреними посиланнями.      |
| `definePlugin(plugin)`             | Повертає плагін, з методами вище.                       |
| `files(options)`                   | Плагін для теки на диску.                               |
| `options()`, `slider`, `select`, … | Налаштування збірки.                                    |
| `userDataDir(name)`                | Тека даних користувача для `name`, на цьому комп'ютері. |
| `buildManifest(config, ctx)`       | Запускає плагіни. Повертає `{ manifest, blobs }`.       |
| `resolveConfig(input, { mode })`   | Викликає функційну конфігурацію, якщо вона така.        |
| `pluginOptions(example, options)`  | Відхиляє плагін, викликаний без об'єкта параметрів.     |

Для плагіна завантажувача: `launchGroups`, `carrying`,
`withLibraryFiles` і типи `LoaderTemplate`, `LoaderGroups`
та `ExtraLibrary`.

## Кожна функція

Кожна функція, у кожному способі використання.

<!-- prettier-ignore -->
```js
// конфігурація, що залежить від команди: opys launch --mode dev
defineConfig(({ mode }) => ({ plugins: [/* … */], manifest: { command: 'java', args: [] } }));

// files
files({ from: 'mods' });                                              // встановлюється як a.jar, sub/b.jar
files({ from: 'mods', to: (file) => '${game_directory}/mods/' + file.rel });
files({ from: 'mods', to: (file) => '${root}/' + file.filename });    // сплощено
files({ from: 'mods', url: (file) => 'https://cdn.example.com/' + file.rel, hash: 'sha256' });
files('mods');
// кидає TypeError: плагін приймає один об'єкт параметрів

// зміна плагіна
files({ from: 'mods' }).exclude('**/*.tmp');
forge({ version: '1.20.1' }).exclude(['**/log4j-*.jar', '**/*-sources.jar']);
forge({ version: '1.20.1' }).addRule('**/*-natives-windows.jar', 'allow.os.windows');
links({ links: [url], to }).removeIntegrity('**/nightly-*.jar');
forge({ version: '1.20.1' }).updateFirst('**/guava-*.jar', { size: 2874025 });
forge({ version: '1.20.1' }).updateMany(
  (file) => 'url' in file.source,
  (file) => ({ source: { url: file.source.url.replace('maven.example.com', 'mirror.example.com') } }),
);
forge({ version: '1.20.1' }).as('forge2');                            // '@forge2.jvmArgs'

// тека даних користувача
userDataDir('my-pack');
// Linux:   ~/.local/share/my-pack   (або $XDG_DATA_HOME/my-pack)
// macOS:   ~/Library/Application Support/my-pack
// Windows: %APPDATA%\my-pack

// збирання без CLI
const config = await resolveConfig(input, { mode: 'build' });
const ctx = { configDir: process.cwd(), mode: 'build', log: (scope, message) => console.log(scope, message) };
const { manifest, blobs } = await buildManifest(config, ctx);
// manifest: { vars, artifacts, launch }   blobs: { '8f434346…': { bytes: 'aGk=' } }
await writeBundle('game.opys', manifest, blobs, { options: config.options }); // з @opys/bundle

// що зупиняє збирання
// '@welcome.flags': 'welcome' exposes no 'flags' (it has: flag)
// два плагіни названо 'welcome': перейменуйте один через `.as('…')`
```

## Документація

- [Конфігурація](https://harmoniya-net.github.io/opys/uk/basics/config): кожне поле, коли і чому його використовувати
- [Написання плагіна](https://harmoniya-net.github.io/opys/uk/plugins/writing-a-plugin)

Частина [opys](https://github.com/harmoniya-net/opys).
