# @opys/minecraft-vanilla

`@opys/minecraft-vanilla` є пакетом, на якому тримається плагін [`minecraft`](./minecraft). Крім плагіна він експортує функції, які перетворюють документ версії від Mojang на артефакти маніфесту, змінні та групи запуску. Кожен завантажувач з родини, наприклад `forge`, `fabric` чи `neoforge`, визначає власний документ версії, а потім проганяє його через ті самі мапери, тож classpath, нативні бібліотеки та ресурси відображаються в одному місці. Ця сторінка для тих, хто пише плагін завантажувача. Якщо ви лише збираєте паки, вам потрібна сторінка [`minecraft`](./minecraft).

```sh
npm install @opys/minecraft-vanilla
```

## Що він дає {#what-it-contributes}

З документа версії мапери створюють:

- **Клієнтський jar.** Один артефакт за шляхом `${version_dir}/client.jar`, зафіксований хешем sha1 і розміром з документа версії.
- **Бібліотеки.** Один артефакт для кожної бібліотеки за шляхом `${library_directory}/<maven path>`, з правилами цієї бібліотеки. Бібліотека без sha1 завантажується без хеша для перевірки.
- **Нативні бібліотеки.** Нативна бібліотека розпаковується до `${natives_directory}` під час встановлення, з увімкненим прапорцем `clean` і без `META-INF/`.
- **Ресурси.** Індекс ресурсів за шляхом `${assets_root}/indexes/<id>.json` і один артефакт для кожного об’єкта ресурсів, зафіксований його sha1. Існують три розкладки, і документ індексу ресурсів каже, яка з них діє. Див. [розкладки ресурсів](/uk/reference/asset-layouts).
- **Classpath.** Одне значення `${classpath}` для кожної операційної системи. Спочатку йде кожна бібліотека, дозволена правилами цієї ОС, у наведеному порядку, а клієнтський jar іде останнім.
- **Запуск.** Команда, аргументи JVM, головний клас та ігрові аргументи, як `Launch` і як окремі частини.

Змінні ті самі, що перелічує сторінка [`minecraft`](./minecraft#variables), а групи запуску ті самі, що в її розділі [груп запуску](./minecraft#launch-groups).

## Сигнатура {#signature}

Плагін приймає ті самі аргументи, що й на сторінці [`minecraft`](./minecraft#signature):
`minecraft(version?, { manifestBase? })`. Його правила [версії](./minecraft#version) такі самі.

## Експорти {#exports}

Кожна функція нижче викликає нативний код. Позначені як _network_ виконують запити; позначені як _pure_ не торкаються вводу-виводу. Типи `Client`, `Library`, `AssetIndex`, `AssetManifest`, `Version`, `VersionManifest` і `MojangArgValue` походять з [`@opys/mojang`](./mojang), а `Artifact`, `ConditionalVal`, `Launch`, `Val`, `Valset` і `ValDefs` з [`@opys/core`](./core).

### Завантаження {#fetching}

| Функція                             | Повертає                     | Значення                                                                                                                                                                                               |
| ----------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `resolveMinecraft(options?)`        | `Promise<MinecraftTemplate>` | _Network._ Шукає версію в маніфесті версій, завантажує її документ версії та індекс ресурсів, а потім відображає їх. Саме її викликає плагін.                                                          |
| `fetchClient(versionId?, options?)` | `Promise<FetchedClient>`     | _Network._ Шукає ідентифікатор у маніфесті версій і завантажує його документ версії. Повертає `{ version, client }`. Без ідентифікатора бере останній реліз. `options` має вигляд `{ manifestBase? }`. |
| `clientToTemplate(client)`          | `Promise<MinecraftTemplate>` | _Network._ Відображає `Client`, який ви вже маєте. Завантажує лише його індекс ресурсів.                                                                                                               |
| `fetchVersionManifest(url?)`        | `Promise<VersionManifest>`   | _Network._ Завантажує `version_manifest_v2.json` або вказану вами адресу.                                                                                                                              |
| `fetchAssetManifest(url)`           | `Promise<AssetManifest>`     | _Network._ Завантажує і розбирає документ індексу ресурсів, тобто список об’єктів ресурсів.                                                                                                            |
| `VERSION_MANIFEST_URL`              | `string`                     | Адреса маніфесту версій від Mojang.                                                                                                                                                                    |

`clientToTemplate` є точкою входу для завантажувача. Завантажувач отримує `Client` своїм шляхом, з інсталятора, профілю лаунчера або релізу, і передає його сюди.

### Мапери {#mappers}

| Функція                                     | Повертає            | Значення                                                                                                             |
| ------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `mapClientToTemplate(client, assets)`       | `MinecraftTemplate` | _Pure._ Клієнт та його документ індексу ресурсів, відображені в шаблон. Чиста половина `clientToTemplate`.           |
| `mapClientJar(client)`                      | `Artifact`          | _Pure._ Клієнтський jar за шляхом `${version_dir}/client.jar`.                                                       |
| `libraryToArtifact(library)`                | `Artifact`          | _Pure._ Одна бібліотека. Нативні бібліотеки отримують правило розпакування.                                          |
| `mapLibraries(libraries)`                   | `Artifact[]`        | _Pure._ `libraryToArtifact` для списку, по порядку.                                                                  |
| `mapAssetIndex(index)`                      | `Artifact`          | _Pure._ Артефакт, який завантажує документ індексу ресурсів, за посиланням `AssetIndex` з документа версії.          |
| `mapAssetObjects(manifest, indexId)`        | `Artifact[]`        | _Pure._ Один артефакт для кожного об’єкта ресурсів, розміщений там, де його шукатиме гра.                            |
| `buildClasspath(entries, clientJarPath)`    | `ConditionalVal[]`  | _Pure._ Гілки `${classpath}`, по одній для кожної ОС, з клієнтським jar в кінці.                                     |
| `buildLaunch(mainClass, gameArgs, jvmArgs)` | `LaunchParts`       | _Pure._ Запуск з головного класу та двох списків аргументів. Ігрові аргументи у виклику йдуть перед аргументами JVM. |

`mapAssetObjects` читає розкладку з самого документа індексу ресурсів, який каже, чи гра використовує хеш-сховище, чи одну з двох старіших розкладок. `indexId` називає каталог для розкладки `legacy` (див. три випадки на сторінці [розкладок ресурсів](/uk/reference/asset-layouts)).

`buildClasspath` приймає записи в тому порядку, в якому ви хочете бачити їх у classpath. Кожен запис має вигляд `{ rules?, artifactPath }`. Вкажіть власні бібліотеки першими, і клієнтський jar стане останнім без вашої участі.

### Типи {#types}

| Тип                 | Форма                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `MinecraftOptions`  | `{ version?, manifestBase? }`                                                              |
| `ClasspathEntry`    | `{ rules?: MojangRuleset, artifactPath: string }`                                          |
| `LaunchParts`       | `{ launch: Launch, jvmArgs: Valset, mainClass: Val, gameArgs: Valset }`                    |
| `MinecraftTemplate` | `LaunchParts` плюс `{ artifacts: Artifact[], vars: ValDefs, classpath: ConditionalVal[] }` |
| `FetchedClient`     | `{ version: Version, client: Client }`                                                     |

`MinecraftTemplate.classpath` тримає ті самі гілки, що й `vars.classpath`. Воно існує тут, щоб завантажувач бачив їх без читання змінних.

::: warning Не входить до пакета
Нативний код також накладає документ `inheritsFrom` від завантажувача на базову версію. Він прибирає кожну базову бібліотеку, яку документ замінює, включно з ванільним клієнтським jar, коли документ перелічує власну бібліотеку `com.mojang:minecraft`, як це роблять документи Forge. Це накладання є функцією `patch_to_template` на Rust, і жодна функція тут до неї не дістається. Завантажувач на JavaScript має сам прибирати замінене, а `buildClasspath` завжди додає клієнтський jar, тож він не годиться для документа з власним клієнтським jar. Див. приклад нижче.
:::

## Як завантажувач їх використовує {#how-a-loader-uses-them}

Завантажувач робить чотири речі: визначає свій документ версії, відображає базову гру, додає власні бібліотеки та збирає запуск. Середні дві виконують мапери.

Ось загальна форма у вигляді нарису. Це не готовий плагін, і тут пропущено власний розбір документа завантажувачем.

```js
import {
  buildClasspath,
  buildLaunch,
  clientToTemplate,
  mapLibraries,
} from '@opys/minecraft-vanilla';

// `client` є Client, який визначив ваш завантажувач. `own` є списком бібліотек,
// які додає його документ, як значень Library.
export async function build(client, own, mainClass, gameArgs, jvmArgs) {
  const vanilla = await clientToTemplate(client);

  const toEntry = (lib) => ({
    rules: lib.rules,
    artifactPath: `\${library_directory}/${lib.artifact.path}`,
  });

  // Приберіть кожну базову бібліотеку, яку замінює ваш документ, за збігом групи й
  // артефакту. Нативні бібліотеки ніколи не збігаються: документ версії до 1.19 дає кожній
  // нативній бібліотеці власну координату її бібліотеки, тож одна заміна
  // видалила б цілий набір для кожної ОС.
  const key = (lib) =>
    lib.native ? null : `${lib.name.groupId}:${lib.name.artifactId}`;
  const replaced = new Set(own.map(key));
  const base = client.libraries.filter(
    (lib) => key(lib) === null || !replaced.has(key(lib)),
  );

  const classpath = buildClasspath(
    [...own.map(toEntry), ...base.map(toEntry)],
    '${version_dir}/client.jar',
  );

  const parts = buildLaunch(mainClass, gameArgs, jvmArgs);

  return {
    artifacts: [...vanilla.artifacts, ...mapLibraries(own)],
    vars: { ...vanilla.vars, classpath },
    launch: {
      command: vanilla.launch.command,
      jvmArgs: parts.jvmArgs,
      mainClass: parts.mainClass,
      gameArgs: parts.gameArgs,
    },
  };
}
```

Три зауваги до цього.

- Список `artifacts` зберігає базові бібліотеки, які завантажувач замінює. Classpath їх більше не називає, але вони все одно завантажуються. Приберіть їх також з `vanilla.artifacts`, якщо це важливо для вашого пака.
- `vars.classpath` замінюється, а не розширюється. `ValDefs` приймає `ConditionalVal[]` замість рядка, тож розгортання вище перекриває значення базової гри.
- `mainClass`, `gameArgs` і `jvmArgs` є тим, що ваш завантажувач зібрав зі свого документа. `buildLaunch` лише обгортає їх. Злиття аргументів базової гри з аргументами завантажувача є вашим кодом.

Про будову завантажувачів з боку збирання див. [написання плагіна](/uk/reference/writing-a-plugin). Про змінні, яких очікує запуск, див. сторінку [`minecraft`](./minecraft#variables).
