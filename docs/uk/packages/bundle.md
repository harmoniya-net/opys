# @opys/bundle

[![npm](https://img.shields.io/npm/v/@opys/bundle.svg)](https://www.npmjs.com/package/@opys/bundle)

Файл `.opys`: маніфест і файли, які він везе, як один zip.
`@opys/bundle` записує один і читає один назад. Маніфест усередині
це маніфест [`@opys/core`](https://www.npmjs.com/package/@opys/core).

```sh
npm install @opys/bundle
```

## Приклад

Запишіть бандл, а потім прочитайте його назад.

```js
import {
  blobFile,
  hashBlobFile,
  readBundle,
  readBundleHead,
  writeBundle,
} from '@opys/bundle';

// перенесений файл названо за sha256 його вмісту
const { id, size } = await hashBlobFile('./server.properties');

const manifest = {
  vars: { root: '/games/pack' },
  artifacts: [
    { path: '${root}/server.properties', source: { blob: id }, size },
    {
      path: '${root}/libs/a.jar',
      source: { url: 'https://example.com/a.jar' },
      integrity: { sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709' },
    },
  ],
};

await writeBundle('pack.opys', manifest, {
  [id]: blobFile('./server.properties'), // де лежать байти блоба
});

readBundleHead('pack.opys'); // { format: 1 }
readBundle('pack.opys'); // маніфест
```

## Формат

Кожна структура бандла: що вона таке, її поля і як вона записана.

```text
Bundle                 a zip
├── opys.json          Head
├── manifest.json      Manifest
└── blobs/<sha256>     the carried files
```

### Bundle

Як публікується маніфест: один zip, зазвичай з назвою `.opys`.

| Елемент          | Що це                                                         |
| ---------------- | ------------------------------------------------------------- |
| `opys.json`      | `Head`.                                                       |
| `manifest.json`  | `Manifest`, цілий, як його описує `@opys/core`.               |
| `blobs/<sha256>` | По одному на перенесений файл, названий за хешем його вмісту. |

```text
pack.opys
├── opys.json
├── manifest.json
└── blobs/
    └── 3d862eef2acd67a2dcb60351bda23e6ad7ebd51939b393eede30ec140ba3c20d
```

- Бандл, який називає блоб, якого він не має, відхиляється перш ніж
  щось встановлюється.
- Дві збирання того самого маніфесту дають ті самі байти.
- Його читає будь-який zip-інструмент: `unzip -p pack.opys manifest.json`.

### Head

Що бандл каже про себе, окремо від встановлення, яке він везе.

| Поле       | Тип           | Що це                                                     |
| ---------- | ------------- | --------------------------------------------------------- |
| `format`   | `number`      | Версія формату: `1`.                                      |
| `options?` | `OptionDef[]` | Що гравець може встановити. Див. [Параметри](#параметри). |

<!-- prettier-ignore -->
```jsonc
// opys.json
{
  "format": 1
}
```

- Читач відхиляє будь-який `format`, крім свого, старіший так само як
  новіший, перш ніж читає маніфест.
- Нічого з маніфесту немає в заголовку. Змінні, команда запуску
  і правила очищення лежать у `manifest.json`.
- Заголовок записано першим і без стиснення, тож він читається без
  розпакування решти.

### Параметри

Що той, хто запускає бандл, може вибрати, у заголовку. Кожен параметр
заповнює змінну або перемикає прапорець, який маніфест уже читає.

<!-- prettier-ignore -->
```js
const written = options()
  .slider('xmx', { min: 1024, max: 16384, step: 512, default: 4096 })
    .title('RAM')
    .unit('MB')
  .select('preset', { low: 'Low', high: 'High' })
    .title('Graphics')
  .text('server')
    .title('Server')
    .placeholder('play.example.net')
  .file('skin')
    .title('Skin')
  .feature('custom_java', (o) => o
    .directory('java_home')
      .title('Java folder'))
    .title('Custom Java');
```

Вид додає параметр, а кроки після нього належать цьому параметру.

| Вид                        | Називає   | У виклику                       | Кроки                    |
| -------------------------- | --------- | ------------------------------- | ------------------------ |
| `.slider(name, range)`     | змінну    | `min`, `max`, `step`, `default` | `unit`                   |
| `.select(name, choices)`   | змінну    | `{ value: label }`              | `default`                |
| `.text(name)`              | змінну    |                                 | `placeholder`, `default` |
| `.file(name)`              | змінну    |                                 |                          |
| `.directory(name)`         | змінну    |                                 |                          |
| `.feature(name, options?)` | прапорець | його налаштування, як функція   | `default`, `options`     |

Кожен вид також має `title`, який йому потрібен, і `subtitle`.

Кожен вид це також окрема функція, для списку:

<!-- prettier-ignore -->
```js
const written = [
  slider('xmx', { min: 1024, max: 16384, step: 512, default: 4096 }).title('RAM'),
  feature('custom_java')
    .title('Custom Java')
    .options(directory('java_home').title('Java folder')),
];
```

У заголовку параметр впізнається за полем, яке тримає його назву:

<!-- prettier-ignore -->
```jsonc
{ "slider": "xmx", "title": "RAM", "min": 1024, "max": 16384, "step": 512, "default": 4096, "unit": "MB" }
{ "select": "preset", "title": "Graphics", "choices": [{ "value": "low", "label": "Low" }, { "value": "high", "label": "High" }], "default": "low" }
{ "feature": "custom_java", "title": "Custom Java", "options": [{ "directory": "java_home", "title": "Java folder" }] }
```

- Ланцюжок це значення. Кожен крок повертає новий.
- Параметри під прапорцем мають значення, лише доки він увімкнений. Вони
  вкладаються на будь-яку глибину.
- Вибір починається з першого варіанта, якщо `default` не каже інакше.
  Варіанти зберігають порядок запису, крім значень, схожих на цілі
  числа, які JavaScript перелічує першими.
- Назва це один параметр: змінну або прапорець, названі двічі,
  відхиляється.
- `default` повзунка лежить від `min` до `max`.
- Це лише схема. Що гравець вибрав, доходить до встановлення як `vars`
  і `features`.

### Manifest

Елемент `manifest.json`: кожен файл до встановлення, як запустити гру
і що видалити. Це саме те, що читає `decodeManifest` з `@opys/core`,
без жодного поля самого бандла.

<!-- prettier-ignore -->
```jsonc
// manifest.json
{
  "vars": { "root": "/games/pack" },
  "artifacts": [
    {
      "path": "${root}/server.properties",
      "source": { "blob": "3d862eef2acd67a2dcb60351bda23e6ad7ebd51939b393eede30ec140ba3c20d" },
      "size": 11
    }
  ],
  "launch": { "command": "java", "workdir": "${root}" },
  "cleanup": [{ "includes": ["${root}/mods/*.jar"] }]
}
```

### Blobs

Не частина формату: де лежать байти кожного блоба, **перш** ніж вони
у бандлі. Мапа від ідентифікатора блоба до `{ file }` або `{ bytes }`
(base64), яку передають у `writeBundle`. Автор збірки ніколи її не пише:
`opys build` робить її з артефактів, чиє джерело це файл або байти.

```js
{ '3d862eef…': { file: './server.properties' } }
```

### Blob

Файл, який везе бандл. Артефакт називає його як `{ "blob": "<sha256>" }`,
а його байти це елемент `blobs/<sha256>`.

- Назва це sha256 вмісту, як 64 малі шістнадцяткові цифри.
- Блоб, який використовують два артефакти, зберігається один раз.
- Кожен блоб звіряється зі своєю назвою, коли записується, і знову, коли
  встановлюється.

## Функції

| Функція                                      | Що робить                                             |
| -------------------------------------------- | ----------------------------------------------------- |
| `writeBundle(path, manifest, blobs?, head?)` | Записує бандл. Відхиляє блоб, якого їй не дали.       |
| `readBundle(path)`                           | Маніфест бандла.                                      |
| `readBundleHead(path)`                       | Сам заголовок. Одне мале читання.                     |
| `options()`, `slider`, `select`, …           | Налаштування заголовка. Див. [Параметри](#параметри). |
| `optionDefs(options)`                        | Параметри так, як їх пише заголовок.                  |
| `hashBlobFile(path)`, `blobId(bytes)`        | Ідентифікатор, під яким йде перенесений файл.         |
| `blobFile(path)`, `blobBytes(bytes)`         | Де лежать байти блоба, для `writeBundle`.             |
| `BUNDLE_FORMAT`                              | `1`.                                                  |

## Кожна функція

Кожна функція, з тим, що вона повертає.

<!-- prettier-ignore -->
```js
await writeBundle('pack.opys', manifest, { [id]: blobFile('./server.properties') });
await writeBundle('pack.opys', manifest, { [id]: blobBytes(bytes) }); // байти, зроблені в пам'яті
await writeBundle('pack.opys', { vars: {}, artifacts: [] });          // без перенесених файлів
await writeBundle('pack.opys', manifest, {});
// rejects: the manifest names blob 3d862eef…, and nothing holds it
await writeBundle('pack.opys', manifest, blobs, { options: options().file('a').title('A') });
await writeBundle('pack.opys', manifest, blobs, { options: options().file('a') });
// rejects: option 'a' has no title: add .title('…') to it

optionDefs(options().file('a').title('A')); // [{ file: 'a', title: 'A' }]

await hashBlobFile('./server.properties'); // { id: '3d862eef…', size: 11 }
blobId(new TextEncoder().encode('hello')); // '2cf24dba…'

readBundleHead('pack.opys'); // { format: 1, options? }
readBundle('pack.opys');     // { vars, artifacts, launch, cleanup }
readBundle('notes.txt');     // throws: not a bundle: …
BUNDLE_FORMAT;               // 1
```

`writeBundle` пише поруч із призначенням і переміщує файл на місце, тож
невдалий запис залишає попередній бандл як був.

## Документація

- [Бандл](https://harmoniya-net.github.io/opys/uk/basics/bundle): що він таке і чому
- [Файл бандла](https://harmoniya-net.github.io/opys/uk/format/bundle): розкладка, для іншого читача або письменника
- [Формат](https://harmoniya-net.github.io/opys/uk/format/): маніфест усередині

Частина [opys](https://github.com/harmoniya-net/opys).
