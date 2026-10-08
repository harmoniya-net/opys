# curseforge

`curseforge` додає до пака файли модів, які ви називаєте на [CurseForge](https://www.curseforge.com/), а `curseforgeModpack` додає цілий модпак з CurseForge: його завантажувач, його файли модів та його перевизначення. Обидва експортуються з `@opys/minecraft`. Використовуйте `curseforge`, коли самі вибираєте моди, і `curseforgeModpack`, коли їх уже вибрав хтось інший.

На відміну від Modrinth, CurseForge потребує ключа API. Обидва плагіни знаходять кожен файл через API CurseForge, яке відповідає лише на запити з ключем. Ключ використовується під час збирання, а зібраному бандлу він не потрібен.

## Ключ API {#api-key}

Візьміть ключ у [консолі CurseForge](https://console.curseforge.com/#/api-keys). Передайте його плагіну як `token`. Плагін сам не читає оточення, тож конфігурація має передати йому значення. У цій статті прийнято `CURSEFORGE_TOKEN`:

```sh
export CURSEFORGE_TOKEN=...   # ваш ключ, у вашій оболонці, ніколи у конфігурації
opys build
```

```js
const token = process.env.CURSEFORGE_TOKEN;
if (!token) throw new Error('Set CURSEFORGE_TOKEN to a CurseForge API key');
```

Варто знати про дві помилки. Якщо `token` це `undefined`, збирання зупиняється з ``Failed to convert JavaScript value `Undefined` into rust type `String` ``, а перевірка вище дає зрозуміліше повідомлення. Якщо API не приймає ключ, збирання зупиняється з `CurseForge API 403 (POST /mods/files)`.

Тримайте ключ поза конфігурацією, якою ви можете ділитися. Бандл його теж не містить: ключ надсилається до API, а URL, які той повертає, це публічні лінки CDN.

## Сигнатури {#signatures}

```ts
curseforge(options: CurseforgePluginOptions): ChainablePlugin
curseforgeModpack(options: CurseforgeModpackOptions): ChainablePlugin
```

Обидва приймають один об’єкт. Посилання на модпак лежить усередині нього, як `file`.

## `curseforge` {#curseforge-1}

| Назва     | Тип                    | Типово                          | Значення                                                                                                                                                                                                                                                                                                                             |
| --------- | ---------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `token`   | `string`               | required                        | Ваш ключ API CurseForge. Див. [ключ API](#api-key).                                                                                                                                                                                                                                                                                  |
| `files`   | `(number \| string)[]` | required                        | Файли, які треба встановити. Кожен запис це числовий ідентифікатор файлу, наприклад `6717445`, або URL сторінки файлу, наприклад `https://www.curseforge.com/minecraft/mc-mods/<slug>/files/<id>`. Ідентифікатор це число після `/files/`. Будь-який інший рядок відхиляється. Кожен файл стає одним артефактом, у заданому порядку. |
| `path`    | `(info) => string`     | required                        | Викликається один раз для кожного файлу і повертає місце, куди файл потрапляє. Див. нижче.                                                                                                                                                                                                                                           |
| `apiBase` | `string`               | `https://api.curseforge.com/v1` | Базовий URL API CurseForge. Змінюйте його лише для дзеркала.                                                                                                                                                                                                                                                                         |

`path` отримує один об’єкт, який описує файл:

| Поле        | Тип      | Значення                           |
| ----------- | -------- | ---------------------------------- |
| `filename`  | `string` | Назва, яку файл має на CurseForge. |
| `fileId`    | `number` | Ідентифікатор файлу.               |
| `projectId` | `number` | Ідентифікатор проєкту мода.        |
| `size`      | `number` | Розмір файлу в байтах.             |

Рядок, який повертає `path`, використовується як шлях артефакту без змін. Запишіть у нього `${game_directory}`, і він заповниться на машині запуску:

```js
path: (info) => '${game_directory}/mods/' + info.filename,
```

Файл, якого CurseForge не повертає, провалює збирання з `CurseForge API did not return metadata for file <id>`. Перевірте ідентифікатор. Плагін встановлює лише ті файли, які ви перелічили, і нічого більше, тож власні залежності мода теж треба перелічити.

## `curseforgeModpack` {#curseforgemodpack}

| Назва     | Тип                                     | Типово                                                         | Значення                                                                                                                                                |
| --------- | --------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `token`   | `string`                                | required                                                       | Ваш ключ API CurseForge. Див. [ключ API](#api-key).                                                                                                     |
| `file`    | `number \| string`                      | required                                                       | Файл модпака: числовий ідентифікатор, наприклад `4800279`, або URL сторінки файлу, `https://www.curseforge.com/.../files/<id>`.                         |
| `apiBase` | `string`                                | `https://api.curseforge.com/v1`                                | Базовий URL API CurseForge. Змінюйте його лише для дзеркала.                                                                                            |
| `loader`  | `(spec: LoaderSpec) => ChainablePlugin` | Плагін opys для завантажувача пака, з його типовими значеннями | Викликається із завантажувачем, який просить пак. Його повернене значення це плагін, який використовується. Див. [параметр loader](#the-loader-option). |

## Що робить плагін модпака {#what-a-modpack-plugin-does}

`curseforgeModpack` це плагін «усе в одному». Він читає пак, бере його завантажувач і піднімає його, тож вам не треба називати завантажувач самостійно. Під час збирання він:

1. **Читає пак.** Знаходить файл модпака, один раз завантажує його `.zip` і читає `manifest.json` усередині. Маніфест називає версію Minecraft, завантажувач модів, кожен файл мода і каталог перевизначень.
2. **Вибирає завантажувач** з `modLoaders` маніфесту. Він бере запис, позначений як `primary`, або перший запис, якщо позначеного немає. Його ідентифікатор має форму `<loader>-<version>`, а відповідність така:

   | Ідентифікатор `modLoaders`   | Використаний плагін завантажувача                                       |
   | ---------------------------- | ----------------------------------------------------------------------- |
   | `forge-<forge>`              | `forge('<minecraft>-<forge>')`, наприклад `1.20.1-47.4.20`              |
   | `fabric-<loader>`            | `fabric(minecraft, { loader: <loader> })`                               |
   | `neoforge-<neoforge>`        | `neoforge(<neoforge>)`                                                  |
   | `quilt-…`                    | Не підтримується. Збирання зупиняється з помилкою.                      |
   | будь-який інший завантажувач | Збирання зупиняється з `Unknown CurseForge mod loader`.                 |
   | жодного запису               | Збирання зупиняється з `CurseForge modpack manifest has no mod loader.` |

   Плагін завантажувача також додає гру, бо завантажувач містить ванільний Minecraft.

3. **Додає файли модів.** Кожен файл з маніфесту шукається за його ідентифікатором і стає одним артефактом у `${game_directory}/mods/<filename>`. Встановлюється кожен файл з маніфесту. Прапорець `required` з маніфесту не читається, тож необов’язковий запис теж встановлюється. Файл, якого CurseForge більше не повертає, зупиняє збирання.
4. **Додає перевизначення.** Файл `.zip` модпака встановлюється до `${root}/cache/curseforge-modpack.zip`. Каталог, який маніфест називає в `overrides` (`overrides`, якщо поле порожнє), розпаковується до `${game_directory}` без назви каталогу.
5. **Знову відкриває запуск.** `command`, `jvmArgs`, `mainClass` і `gameArgs` завантажувача доступні під `curseforgeModpack`, тож той самий блок `manifest` працює для пака на Forge, Fabric чи NeoForge.

Java не входить до пака. Маніфест не називає JDK, тож додайте `java(...)` самостійно.

::: warning Quilt
Пак на Quilt провалює збирання, бо opys не має завантажувача Quilt.
:::

### Параметр `loader` {#the-loader-option}

`loader` замінює типовий плагін завантажувача. Він отримує специфікацію, яка є однією з таких:

| `spec.loader` | Поля                              | Типовий плагін                                |
| ------------- | --------------------------------- | --------------------------------------------- |
| `'fabric'`    | `minecraft`, `fabricLoader`       | `fabric(minecraft, { loader: fabricLoader })` |
| `'forge'`     | `version` (`<minecraft>-<forge>`) | `forge(version)`                              |
| `'neoforge'`  | `version`                         | `neoforge(version)`                           |
| `'vanilla'`   | `minecraft`                       | `minecraft(minecraft)`                        |

Використовуйте його, щоб дати завантажувачу власні параметри, наприклад дзеркало для його індексу документів. Типовий плагін не експортується, тож коли ви його замінюєте, пропишіть випадок для кожної специфікації, яку пак може попросити. Пак з CurseForge ніколи не просить `'vanilla'`, бо він мусить назвати завантажувач, але тип її містить:

```js
import { fabric, forge, minecraft, neoforge } from '@opys/minecraft';

// mirror.example.com це заглушка для вашого власного дзеркала.
const forgeIndex = 'https://mirror.example.com/metadata/forge';

curseforgeModpack({
  token,
  file: 4800279,
  loader: (spec) => {
    switch (spec.loader) {
      case 'fabric':
        return fabric(spec.minecraft, { loader: spec.fabricLoader });
      case 'forge':
        return forge(spec.version, { source: forgeIndex });
      case 'neoforge':
        return neoforge(spec.version);
      case 'vanilla':
        return minecraft(spec.minecraft);
    }
  },
});
```

## Як файли фіксуються {#how-files-are-pinned}

Кожен файл фіксується за гешем, який CurseForge наводить для нього, коли наводить. Інсталятор перевіряє завантажене за цим гешем.

- **Файли модів.** Артефакт несе sha1 файлу з API та його розмір. Якщо API не наводить sha1 для файлу, артефакт не несе гешу.
- **URL завантаження.** URL це той, який API дає для файлу. Коли API не дає жодного, що стається, коли автор відмовився від поширення через третіх осіб, URL це адреса файлу на CDN CurseForge, виведена з його ідентифікатора та назви.
- **Перевизначення.** Файл `.zip` модпака гешується під час збирання, за його sha1 та розміром. Інсталятор завантажує його знову і перевіряє байти за цим гешем.

Зібраний бандл встановлюється без ключа, бо кожен URL у ньому це публічний лінк CDN.

## Приклад {#example}

Конфігурація нижче встановлює один файл мода на Forge 1.20.1. Перед збиранням задайте `CURSEFORGE_TOKEN` як ваш ключ.

```js
import { defineConfig, userDataDir } from '@opys/dev';
import { curseforge, forge, java } from '@opys/minecraft';

const token = process.env.CURSEFORGE_TOKEN;
if (!token) throw new Error('Set CURSEFORGE_TOKEN to a CurseForge API key');

export default defineConfig({
  output: 'game.opys',
  plugins: [
    forge('1.20.1'),
    java('17'),
    curseforge({
      token,
      path: (info) => '${game_directory}/mods/' + info.filename,
      files: [
        6717445, // ідентифікатор файлу; підійде й URL сторінки файлу
      ],
    }),
  ],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ forge }) => [forge.jvmArgs, forge.mainClass, forge.gameArgs],
    workdir: '${game_directory}',
  },
  runClient: (manifest) => ({
    vars: {
      ...manifest.vars,
      root: userDataDir('my-pack'),
      username: 'Player',
      uuid: '00000000-0000-0000-0000-000000000001',
      token: '0', // токен доступу гри, а не ключ CurseForge
    },
  }),
});
```

Конфігурація модпака має ту саму форму, з `curseforgeModpack` замість завантажувача і модів:

```js
import { defineConfig } from '@opys/dev';
import { curseforgeModpack, java } from '@opys/minecraft';

const token = process.env.CURSEFORGE_TOKEN;
if (!token) throw new Error('Set CURSEFORGE_TOKEN to a CurseForge API key');

export default defineConfig({
  output: 'game.opys',
  plugins: [
    curseforgeModpack({ token, file: 4800279 }),
    // Fabulously Optimized 5.4.1 для Minecraft 1.20.1, якому потрібна Java 17.
    java('17'),
  ],
  manifest: {
    command: ({ curseforgeModpack }) => curseforgeModpack.command,
    args: ({ curseforgeModpack }) => [
      curseforgeModpack.jvmArgs,
      curseforgeModpack.mainClass,
      curseforgeModpack.gameArgs,
    ],
    workdir: '${game_directory}',
  },
});
```

## Див. також {#see-also}

- [`modrinth`](./modrinth) робить те саме для Modrinth, без потреби в ключі.
- [`links`](./link) фіксує файл на будь-якому іншому сайті.
- [`files`](./files) додає файли з вашого диска.
