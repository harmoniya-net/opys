# @opys/mojang

`@opys/mojang` розбирає формати, які публікує Mojang: маніфест версій, JSON версії, бібліотеки, аргументи та індекси ресурсів. Він також містить строгий обчислювач правил Mojang. Користуйтеся ним, коли самі читаєте ці документи. Ця сторінка перелічує кожен експорт. Пакунок не виконує вводу-виводу: ви отримуєте документи, а він їх розбирає.

```ts
import {
  parseVersionManifest,
  findVersion,
  latestRelease,
  parseClient,
  parseAssetManifest,
  satisfiesRuleset,
} from '@opys/mojang';
```

Функції правил приймають лише власну форму Mojang. Скорочений запис opys, такий як `'allow.os.linux'`, описано в [`@opys/core`](/uk/plugins/core) і тут він відхиляється. Типи правил описано в [`@opys/mojang-rules`](/uk/plugins/mojang-rules).

## Маніфест версій {#version-manifest}

### `parseVersionManifest` {#parseversionmanifest}

```ts
function parseVersionManifest(raw: unknown): VersionManifest;
```

Розбирає `version_manifest_v2.json`.

### `findVersion` {#findversion}

```ts
function findVersion(
  manifest: VersionManifest,
  id: string,
): Version | undefined;
```

Повертає запис із таким `id` або `undefined`, коли його немає.

### `latestRelease` {#latestrelease}

```ts
function latestRelease(manifest: VersionManifest): Version;
```

Повертає запис, названий у `latest.release`. Кидає виняток, коли `versions` маніфеста його не містить.

### `VERSION_MANIFEST_URL` {#versionmanifesturl}

```ts
const VERSION_MANIFEST_URL: string;
```

Адреса маніфеста версій, `https://launchermeta.mojang.com/mc/game/version_manifest_v2.json`.

## JSON версії {#version-json}

### `parseClient` {#parseclient}

```ts
function parseClient(raw: unknown): Client;
```

Розбирає JSON версії у `Client`: його id, версію Java, індекс ресурсів, завантаження, головний клас, бібліотеки, аргументи, метадані релізу та налаштування журналювання. JSON версії дає свої аргументи як `arguments` або як застарілий `minecraftArguments`; коли є обидва, використовується `arguments`, а коли немає жодного, розбір кидає виняток. Версія без `javaVersion` отримує `{ component: 'jre-legacy', majorVersion: 8 }`.

### `parseLibraries` {#parselibraries}

```ts
function parseLibraries(raws: unknown[]): Library[];
```

Розбирає масив `libraries` з JSON версії окремо. Результат плоский: один запис JSON стає `Library` для його головного артефакта, якщо він є, і ще одним для кожного переліченого класифікатора нативів, кожен із правилом для своєї ОС і встановленим `native`. Кожен запис потребує об’єкта `downloads`.

### `parseArguments` {#parsearguments}

```ts
function parseArguments(raw: unknown): Arguments;
```

Розбирає об’єкт `arguments` з JSON версії або застарілий рядок `minecraftArguments`. Для рядка аргументи гри це його слова, аргументи JVM це `LEGACY_JVM_ARGS`, а `Arguments.legacy` має значення `true`.

### `mergeArgs` {#mergeargs}

```ts
function mergeArgs(base: Arguments, patch: Arguments): Arguments;
```

Накладає аргументи версії-патча на аргументи базової версії, як це робить `inheritsFrom`: аргументи `jvm` і `game` з патча йдуть після базових. Застарілий патч не має структурованих аргументів для додавання, тому основа повертається без змін.

### `LEGACY_JVM_ARGS` {#legacyjvmargs}

```ts
const LEGACY_JVM_ARGS: MojangArgValue[];
```

Аргументи JVM, які передбачає застаріла версія з `minecraftArguments`: `-Djava.library.path=${natives_directory}`, `-cp` і `${classpath}`.

## Індекс ресурсів {#asset-index}

### `parseAssetManifest` {#parseassetmanifest}

```ts
function parseAssetManifest(raw: unknown): AssetManifest;
```

Розбирає індекс ресурсів. `objects` відображає назву кожного ресурсу на його `hash` і `size`. `virtual` має значення `true` для індексу `legacy` (Minecraft від 1.6 до 1.7.2), а `map_to_resources` для індексу `pre-1.6`. В інших випадках обидва відсутні.

### `assetUrl` {#asseturl}

```ts
function assetUrl(hash: string): string;
```

Адреса завантаження об’єкта ресурсів із таким гешем: `https://resources.download.minecraft.net/<first two characters>/<hash>`.

### `assetPath` {#assetpath}

```ts
function assetPath(hash: string): string;
```

Шлях об’єкта ресурсів із таким гешем відносно каталога objects: `<first two characters>/<hash>`.

## Координати Maven {#maven-coordinates}

### `parseMaven` {#parsemaven}

```ts
function parseMaven(value: string): MavenCoord;
```

Розбирає координату Maven із двох-п’яти сегментів, розділених двокрапками. Два сегменти це `group:artifact`. Три додають версію, `group:artifact:version`. Чотири додають класифікатор після неї, `group:artifact:version:classifier`. П’ять це `group:artifact:packaging:classifier:version`. За будь-якої іншої кількості кидає виняток.

### `encodeMaven` {#encodemaven}

```ts
function encodeMaven(c: MavenCoord): string;
```

Записує `MavenCoord` назад як рядок координати. Хвіст, який не вдається записати повністю, відкидається: класифікатор без версії повертається як `group:artifact`.

### `isNativeMaven` {#isnativemaven}

```ts
function isNativeMaven(c: MavenCoord): boolean;
```

`true`, коли класифікатор координати починається з `natives`, наприклад `natives-linux`.

### `mavenMatchesIgnoringVersion` {#mavenmatchesignoringversion}

```ts
function mavenMatchesIgnoringVersion(a: MavenCoord, b: MavenCoord): boolean;
```

`true`, коли дві координати збігаються в кожному полі, крім `version`.

## Правила {#rules}

Ці функції приймають форму Mojang. Форму правила і те, як обчислюється набір правил, див. у [`@opys/mojang-rules`](/uk/plugins/mojang-rules).

### `decodeRuleset` {#decoderuleset}

```ts
function decodeRuleset(raw: unknown): MojangRuleset;
```

Декодує набір правил з його JSON, який є масивом правил. Кидає виняток на скороченому записі, такому як `'allow.os.linux'`. Не кидає виняток на правилі, яке не може прочитати як написано, такому як невідома назва ОС; див. [Читання правила](/uk/plugins/mojang-rules#reading-a-rule).

### `encodeRuleset` {#encoderuleset}

```ts
function encodeRuleset(ruleset: MojangRuleset): unknown;
```

Кодує набір правил як JSON, який тримає документ версії. Записує розгорнуту форму і ніколи скорочений запис.

### `satisfiesRuleset` {#satisfiesruleset}

```ts
function satisfiesRuleset(
  rules: MojangRuleset,
  platform: OsOptions,
  features?: string[],
): boolean;
```

`true`, коли виконується кожне правило в наборі. Порожній набір виконується. Кидає виняток, коли доходить до правила, чий шаблон версії ОС не є правильним регулярним виразом.

### `satisfiesRule` {#satisfiesrule}

```ts
function satisfiesRule(
  rule: MojangRule,
  platform: OsOptions,
  features?: string[],
): boolean;
```

Обчислює одне правило. `features` читається лише правилом з обмеженням `features`.

### `satisfiesOs` {#satisfiesos}

```ts
function satisfiesOs(constraint: OsConstraint, platform: OsOptions): boolean;
```

`true`, коли кожне задане поле обмеження збігається з платформою. `name` і `arch` мусять дорівнювати платформі. `version` з обмеження це регулярний вираз, який шукається будь-де у версії платформи.

### `satisfiesFeatures` {#satisfiesfeatures}

```ts
function satisfiesFeatures(
  constraint: FeatureConstraint,
  features?: string[],
): boolean;
```

`true`, коли кожна ознака в обмеженні присутня або відсутня, як каже її значення.

## Типи {#types}

Реекспортовано з [`@opys/mojang-rules`](/uk/plugins/mojang-rules): `OsName`, `OsArch`, `OsOptions`, `OsConstraint`, `FeatureConstraint`, `RuleAction`, `MojangRule`, `MojangRuleset`. Також `emptyRuleset` і `allowOsRuleset`, які є тими самими функціями, що й у тому пакунку.

Розібрано з документів Mojang:

| Тип               | Форма                                                                                             | Що це                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `MavenCoord`      | `groupId`, `artifactId`, `version?`, `classifier?`, `packaging?`                                  | Координата Maven.                                                               |
| `Artifact`        | `path`, `sha1`, `size`, `url`                                                                     | Файл, названий бібліотекою.                                                     |
| `Library`         | `name`, `rules`, `artifact`, `native`                                                             | Один файл з `libraries` версії після розгортання, описаного в `parseLibraries`. |
| `MojangArgValue`  | `string \| { rules, value: string \| string[] }`                                                  | Один аргумент або такий, що застосовується лише коли виконуються його правила.  |
| `Arguments`       | `game`, `jvm`, `legacy`                                                                           | Ігрові аргументи версії та аргументи JVM.                                       |
| `JavaVersion`     | `component`, `majorVersion`                                                                       | Середовище Java, яке просить версія.                                            |
| `AssetObject`     | `hash`, `size`                                                                                    | Один запис `objects` індексу ресурсів.                                          |
| `AssetManifest`   | `objects`, `virtual?`, `map_to_resources?`                                                        | Індекс ресурсів. Два прапорці позначають застарілі розкладки.                   |
| `AssetIndex`      | `id`, `sha1`, `size`, `totalSize`, `url`                                                          | Посилання на індекс ресурсів версії.                                            |
| `DownloadsFile`   | `sha1`, `size`, `url`                                                                             | Один файл, названий у `downloads` версії.                                       |
| `Downloads`       | `client`, `clientMappings?`, `server?`, `windowsServer?`, `serverMappings?`                       | Файли, які завантажує версія.                                                   |
| `LoggingFile`     | `id`, `sha1`, `size`, `url`                                                                       | Файл конфігурації журнала.                                                      |
| `LoggingClient`   | `argument`, `file`, `type`                                                                        | Налаштування журналювання клієнта.                                              |
| `Logging`         | `client`                                                                                          | Блок журналювання версії.                                                       |
| `ClientMetadata`  | `type`, `time`, `releaseTime`, `minimumLauncherVersion`, `assets`, `complianceLevel`              | Деталі релізу версії.                                                           |
| `Client`          | `id`, `java`, `assetIndex`, `downloads`, `mainClass`, `libraries`, `args`, `metadata`, `logging?` | Розібраний JSON версії.                                                         |
| `Version`         | `id`, `type`, `url`, `time`, `releaseTime`, `sha1`, `complianceLevel`                             | Один запис маніфеста версій.                                                    |
| `VersionManifest` | `latest: { release, snapshot }`, `versions`                                                       | Маніфест версій.                                                                |

::: warning Розбір і HTTP
Розбирачі не завантажують. Щоб завантажити JSON версії або індекс ресурсів, користуйтеся функціями завантаження в [`@opys/minecraft-vanilla`](/uk/plugins/minecraft-vanilla): `fetchVersionManifest`, `fetchAssetManifest` і `fetchClient`.
:::
