# @opys/mojang

[![npm](https://img.shields.io/npm/v/@opys/mojang.svg)](https://www.npmjs.com/package/@opys/mojang)

Парсери файлів, які публікує Mojang: список версій, файл версії, його
бібліотеки, аргументи та індекс ресурсів. Вживайте його, щоб написати
плагін завантажувача або власний інструмент. Автор збірки ніколи його
не імпортує.

```sh
npm install @opys/mojang
```

## Приклад

Знайдіть версію, а потім прочитайте, з чого вона складається.

```js
import {
  VERSION_MANIFEST_URL,
  findVersion,
  parseClient,
  parseVersionManifest,
  satisfiesRuleset,
} from '@opys/mojang';

const list = parseVersionManifest(
  await (await fetch(VERSION_MANIFEST_URL)).json(),
);
const version = findVersion(list, '1.21.1');
if (!version) throw new Error('no such version');

const client = parseClient(await (await fetch(version.url)).json());
client.mainClass; // клас, з якого стартує гра

const linux = { name: 'linux', version: '6.12', arch: 'x86_64' };
client.libraries.filter((lib) => satisfiesRuleset(lib.rules, linux)); // що отримує Linux
```

Пакет не робить доступу до мережі чи файлів. Ви завантажуєте, він
розбирає.

## Що він читає

| Файл Mojang              | Парсер                 | Дає               |
| ------------------------ | ---------------------- | ----------------- |
| Список версій            | `parseVersionManifest` | `VersionManifest` |
| Файл версії, `<id>.json` | `parseClient`          | `Client`          |
| Його `libraries`         | `parseLibraries`       | `Library[]`       |
| Його `arguments`         | `parseArguments`       | `Arguments`       |
| Індекс ресурсів          | `parseAssetManifest`   | `AssetManifest`   |
| Maven-координата         | `parseMaven`           | `MavenCoord`      |
| Список правил            | `decodeRuleset`        | `MojangRuleset`   |

### Client

Файл версії, прочитаний.

| Поле         | Тип              | Що це                                          |
| ------------ | ---------------- | ---------------------------------------------- |
| `id`         | `string`         | Версія: `'1.21.1'`.                            |
| `mainClass`  | `string`         | Клас, з якого стартує гра.                     |
| `libraries`  | `Library[]`      | Її бібліотеки, кожна зі своїми правилами.      |
| `args`       | `Arguments`      | Аргументи гри і JVM.                           |
| `downloads`  | `Downloads`      | Jar клієнта і сервера, якщо він є.             |
| `assetIndex` | `AssetIndex`     | Де лежить індекс ресурсів.                     |
| `java`       | `JavaVersion`    | Java, яку він просить: `{ majorVersion: 21 }`. |
| `metadata`   | `ClientMetadata` | Його тип і час випуску.                        |
| `logging?`   | `Logging`        | Конфігурація log4j, коли вона є.               |

### Library

| Поле       | Тип             | Що це                                 |
| ---------- | --------------- | ------------------------------------- |
| `name`     | `MavenCoord`    | Координата, розібрана.                |
| `artifact` | `Artifact`      | `path`, `url`, `sha1` і `size` jar.   |
| `rules`    | `MojangRuleset` | Для яких комп'ютерів він призначений. |
| `native`   | `boolean`       | Чи це jar з нативними бібліотеками.   |

### Arguments

| Поле     | Тип                | Що це                                        |
| -------- | ------------------ | -------------------------------------------- |
| `game`   | `MojangArgValue[]` | Аргументи гри.                               |
| `jvm`    | `MojangArgValue[]` | Аргументи JVM.                               |
| `legacy` | `boolean`          | Чи походить зі старого `minecraftArguments`. |

Аргумент це рядок або `{ rules, value }` для того, що залежить від
комп'ютера.

### MavenCoord

| Поле          | Тип      | В `org.lwjgl:lwjgl:3.3.3:natives-linux` |
| ------------- | -------- | --------------------------------------- |
| `groupId`     | `string` | `org.lwjgl`                             |
| `artifactId`  | `string` | `lwjgl`                                 |
| `version?`    | `string` | `3.3.3`                                 |
| `classifier?` | `string` | `natives-linux`                         |

## Правила

Обчислення формату правил Mojang. Типи це типи
[`@opys/mojang-rules`](https://www.npmjs.com/package/@opys/mojang-rules),
і вони експортуються і звідси теж.

| Функція                                    | Проходить, коли                                 |
| ------------------------------------------ | ----------------------------------------------- |
| `satisfiesRuleset(rules, os, features?)`   | Проходить кожне правило. `[]` завжди проходить. |
| `satisfiesRule(rule, os, features?)`       | Проходить це одне правило.                      |
| `satisfiesOs(constraint, os)`              | Комп'ютер збігається.                           |
| `satisfiesFeatures(constraint, features?)` | Прапорці збігаються.                            |

Вони приймають лише об'єктну форму. Коротка форма, `'allow.os.linux'`,
це власна форма opys, і її читає
[`@opys/core`](https://www.npmjs.com/package/@opys/core) в обох
написаннях.

## Кожна функція

Кожна функція, з тим, що вона повертає.

<!-- prettier-ignore -->
```js
const linux = { name: 'linux', version: '6.12', arch: 'x86_64' };

// список версій
VERSION_MANIFEST_URL;                  // 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json'
const list = parseVersionManifest(json);
findVersion(list, '1.21.1');           // { id: '1.21.1', type: 'release', url, sha1, … }
findVersion(list, '9.9');              // undefined
latestRelease(list);                   // версія, названа в `latest.release`

// файл версії
parseClient(json);                     // Client
parseClient({});                       // кидає: відсутнє поле `id`
parseLibraries(json.libraries);        // [{ name, artifact, rules: [], native: false }]

// аргументи: сучасний об'єкт або старий рядок
parseArguments({ game: ['--demo'], jvm: ['-cp', '${classpath}'] });
// { game: ['--demo'], jvm: ['-cp', '${classpath}'], legacy: false }
parseArguments('--username ${auth_player_name}');
// { game: ['--username', '${auth_player_name}'], jvm: LEGACY_JVM_ARGS, legacy: true }
LEGACY_JVM_ARGS;                       // ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}']

// аргументи завантажувача поверх аргументів гри: аргументи патча йдуть після базових
mergeArgs(base, patch);
mergeArgs(base, legacyPatch);          // base без змін: патч старого стилю нічого не додає

// ресурси
parseAssetManifest(json);              // { objects: { 'icons/icon_16x16.png': { hash, size } } }
assetPath('5ff04807c356f1beed0b86ccf659b44b9983e3fa'); // '5f/5ff04807…'
assetUrl('5ff04807c356f1beed0b86ccf659b44b9983e3fa');  // 'https://resources.download.minecraft.net/5f/5ff04807…'

// maven
const coord = parseMaven('org.lwjgl:lwjgl:3.3.3:natives-linux');
// { groupId: 'org.lwjgl', artifactId: 'lwjgl', version: '3.3.3', classifier: 'natives-linux' }
encodeMaven({ groupId: 'org.lwjgl', artifactId: 'lwjgl', version: '3.3.3' }); // 'org.lwjgl:lwjgl:3.3.3'
isNativeMaven(coord);                  // true
mavenMatchesIgnoringVersion(parseMaven('a:b:1'), parseMaven('a:b:2')); // true

// правила
decodeRuleset([{ action: 'allow', os: { name: 'osx' } }]); // те саме, перевірене
decodeRuleset('allow.os.osx');         // кидає: коротка форма це форма @opys/core
encodeRuleset([{ action: 'allow' }]);  // [{ action: 'allow' }]

satisfiesRuleset([], linux);                                               // true
satisfiesRuleset([{ action: 'allow' }, { action: 'disallow', os: { name: 'osx' } }], linux); // true
satisfiesRule({ action: 'disallow', os: { name: 'osx' } }, linux);         // true
satisfiesRule({ action: 'allow', features: { is_demo_user: true } }, linux);                   // false
satisfiesRule({ action: 'allow', features: { is_demo_user: true } }, linux, ['is_demo_user']); // true
satisfiesOs({ name: 'linux', arch: 'x86_64' }, linux);                     // true
satisfiesFeatures({ is_demo_user: false }, []);                            // true
```

## Документація

- [Правила](https://harmoniya-net.github.io/opys/uk/format/rules): як їх вживає маніфест
- [Як зібрано opys](https://harmoniya-net.github.io/opys/uk/reference/architecture)

Частина [opys](https://github.com/harmoniya-net/opys).
