# @opys/core

[![npm](https://img.shields.io/npm/v/@opys/core.svg)](https://www.npmjs.com/package/@opys/core)

Формат opys як код. `@opys/core` це типи, з яких складається маніфест,
і функції, які перевіряють і обчислюють його. Використовуйте його, щоб
переглянути або створити маніфест самостійно. Автор збірки ніколи його
не імпортує. Файл `.opys`, у якому зберігається маніфест, це
[`@opys/bundle`](https://www.npmjs.com/package/@opys/bundle).

```sh
npm install @opys/core
```

## Приклад

Кожна частина маніфесту це те, що пише конфігурація або плагін пише
для неї. `opys build` перетворює конфігурацію на маніфест.

```js
// opys.config.mjs
export default defineConfig({
  plugins: [minecraft({ version: '1.21.1' }), java({ version: '21' })],
  manifest: {
    command: '@minecraft.command',
    args: ['@minecraft.jvmArgs', '-Xmx4G', '@minecraft.mainClass'],
    workdir: '${game_directory}',
    cleanup: [{ includes: ['${game_directory}/mods/*.jar'] }],
  },
});
```

## Формат

Кожна структура формату: що вона таке, як її пише конфігурація і чим
вона є в маніфесті. Тип TypeScript з тією самою назвою експортується.

```text
Manifest
├── vars               ValDefs
├── artifacts          Artifact[]
│   ├── source         Source
│   ├── integrity      Integrity
│   ├── rules          Ruleset
│   └── extract        ExtractRule
├── launch             Launch
└── cleanup            CleanupRule[]
```

`${name}` всередині рядка це змінна. Кожен приклад це частина
`opys.config.mjs`, а потім те саме в `manifest.json`.

### Manifest

Ціле встановлення: що встановити, як його запустити, що видалити. У
бандлі це елемент `manifest.json`.

<!-- prettier-ignore -->
```js
// opys.config.mjs
export default defineConfig({
  plugins: [],
  manifest: {
    vars: { root: '/games/pack' },                    // ValDefs: названі значення
    artifacts: [                                      // Artifact[]: файли до встановлення
      {
        path: '${root}/libs/a.jar',
        source: { url: 'https://example.com/a.jar' },
        integrity: { sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709' },
      },
    ],
    command: 'java',                                  // ці три стають `launch`
    args: ['-cp', '${root}/libs/a.jar', 'com.example.Main'],
    workdir: '${root}',
    cleanup: [{ includes: ['${root}/mods/*.jar'] }],  // CleanupRule[]: що видалити після встановлення
  },
});
```

<!-- prettier-ignore -->
```jsonc
// manifest.json
{
  "vars": { "root": "/games/pack" },
  "artifacts": [
    {
      "path": "${root}/libs/a.jar",
      "source": { "url": "https://example.com/a.jar" },
      "integrity": { "sha1": "da39a3ee5e6b4b0d3255bfef95601890afd80709" }
    }
  ],
  "launch": {
    "command": "java",
    "workdir": "${root}",
    "args": ["-cp", "${root}/libs/a.jar", "com.example.Main"]
  },
  "cleanup": [{ "includes": ["${root}/mods/*.jar"] }]
}
```

- Кожне поле можна пропустити. Без `launch` маніфест можна встановити,
  але не запустити.
- Плагіни додають до `vars`, `artifacts` і рядка запуску. Те, що
  конфігурація пише рукою, перемагає плагін.

### ValDefs

Змінні: мапа від назви до її значення. Використовується в `vars` і в
`launch.envs`.

<!-- prettier-ignore -->
```js
manifest: {
  vars: {
    root: '/games/pack',                // рядок: той самий на кожному комп'ютері
    game_directory: '${root}/',         // значення може використовувати інші змінні
    classpath_separator: [              // список виборів: по одному на платформу, перемагає останній, що проходить
      { value: ':' },                   //   без правил: завжди проходить, тож це типове
      { value: ';', rules: 'allow.os.windows' },
    ],
  },
  envs: { PACK: 'my-pack' },            // та сама форма, для середовища гри
}
```

<!-- prettier-ignore -->
```jsonc
"vars": {
  "root": "/games/pack",
  "game_directory": "${root}/",
  "classpath_separator": [
    { "value": ":" },
    { "value": ";", "rules": "allow.os.windows" }
  ]
}
```

- Цикл між змінними це помилка.
- Назва, яку ніщо не визначає, залишається як написана: гра отримує
  `${username}`.
- `\${` це буквальне `${`.

### ConditionalVal

Один вибір значення змінної.

<!-- prettier-ignore -->
```js
vars: {
  java_bin: [
    {
      value: '${java_home}/bin/java',       // рядок: значення
    },
    {
      value: '${java_home}/bin/javaw.exe',
      rules: 'allow.os.windows',            // Ruleset, необов'язково: де застосовується. Пропущено: скрізь
    },
  ],
}
```

<!-- prettier-ignore -->
```jsonc
{ "value": "${java_home}/bin/javaw.exe", "rules": "allow.os.windows" }
```

Якщо не проходить жоден вибір, змінна взагалі не визначена.

### Ruleset

Де щось застосовується. Одне `Rule` або їхній список. **Кожне** правило
мусить проходити.

<!-- prettier-ignore -->
```js
artifacts: [
  { path: '…', source: { url: '…' }, rules: 'allow.os.linux' },                              // одне правило
  { path: '…', source: { url: '…' }, rules: ['allow.os.linux', 'disallow.features.demo'] },  // на Linux, з вимкненим `demo`
]

// або додане до того, що встановлює плагін
forge({ version: '1.20.1' }).addRule('**/*-natives-windows.jar', 'allow.os.windows')
```

<!-- prettier-ignore -->
```jsonc
"rules": "allow.os.linux"
"rules": ["allow.os.linux", "disallow.features.demo"]
```

Два правила `allow` для двох систем ніде не проходять, бо жоден
комп'ютер не є обома водночас. «Windows або Linux» це `disallow.os.osx`.

### Rule

Одна умова. Вона має два написання з тим самим значенням, і читач
приймає обидва.

<!-- prettier-ignore -->
```js
rules: 'allow.os.osx'                                              // коротке: '<action>.<kind>.<value>'
rules: { action: 'allow', os: { name: 'osx' } }                    // довге: форма, яку використовують власні файли гри

rules: 'allow.arch.aarch64'
rules: { action: 'allow', os: { arch: 'aarch64' } }

rules: 'disallow.features.is_demo_user'
rules: { action: 'disallow', features: { is_demo_user: true } }

// довга форма, поле за полем
rules: {
  action: 'allow',                          // 'allow' | 'disallow'
  os: { name: 'osx', arch: 'aarch64' },     // необов'язково: name, arch, version. Усі наведені поля мусять збігатися
  // features: { is_demo_user: true },      // або це: кожен прапорець мусить бути ввімкнений (true) або вимкнений (false)
}
```

Що може сказати коротка форма:

| Правило                       | Проходить                         |
| ----------------------------- | --------------------------------- |
| `allow.os.windows`            | На Windows. Також `linux`, `osx`. |
| `allow.arch.aarch64`          | На ARM64. Також `x86_64`.         |
| `allow.features.java_console` | Коли той прапорець увімкнено.     |
| `allow.os.osx@^14`            | На macOS зі збіжною версією.      |
| `disallow.os.osx`             | Скрізь, крім macOS.               |
| `allow`, `disallow`           | Завжди, ніколи.                   |

Правило `disallow` проходить, коли його умова **не** виконується.

### Artifact

Один файл встановлення: куди він йде, звідки береться, як
перевіряється.

<!-- prettier-ignore -->
```js
manifest: {
  artifacts: [
    {
      path: '${game_directory}/mods/tweaks.jar',                // рядок: куди записується файл
      source: { url: 'https://example.com/tweaks-1.0.jar' },    // Source: звідки беруться його байти
      integrity: { sha256: 'ce79869e…' },                       // Integrity, необов'язково: хеш, який він мусить мати
      size: 110704,                                             // число, необов'язково: байти. Для поступу, не для перевірки
      rules: 'allow.os.linux',                                  // Ruleset, необов'язково: які комп'ютери його отримують. Пропущено: усі
      extract: { into: '${natives_directory}', clean: true },   // ExtractRule або список, необов'язково: як його розпакувати
      metadata: { from: 'my own build' },                       // будь-що, необов'язково: нотатки. Інсталятор ігнорує їх
    },
  ],
}
```

<!-- prettier-ignore -->
```jsonc
{
  "path": "${game_directory}/mods/tweaks.jar",
  "source": { "url": "https://example.com/tweaks-1.0.jar" },
  "integrity": { "sha256": "ce79869e…" },
  "size": 110704,
  "rules": "allow.os.linux",
  "extract": { "into": "${natives_directory}", "clean": true },
  "metadata": { "from": "my own build" }
}
```

- Будь-яке інше поле це помилка. Поле, якого читач не розуміє, могло
  б змінити те, що встановлюється.
- Без `integrity` файл ніколи не перевіряється: коли він існує, він
  зберігається, навіть якщо джерело змінилося.
- Більшість артефактів надходить від плагінів. Написаний рукою замінює
  артефакт плагіна за тим самим `path`.

### Source

Звідки беруться байти артефакту. Одне з двох, їх розрізняє присутнє
поле.

<!-- prettier-ignore -->
```js
source: { url: 'https://example.com/a-1.0.jar' }   // завантаження. URL може використовувати змінні
source: { blob: '3d862eef…' }                      // перенесений файл: елемент бандла blobs/<blob>
```

Конфігурація рідко пише `blob` сама. Плагін `files` з `@opys/dev`
переносить теку, і кожен файл стає одним:

<!-- prettier-ignore -->
```js
plugins: [files({ from: 'config', to: (file) => '${game_directory}/config/' + file.rel })]
```

<!-- prettier-ignore -->
```jsonc
{ "url": "https://example.com/a-1.0.jar" }
{ "blob": "3d862eef2acd67a2dcb60351bda23e6ad7ebd51939b393eede30ec140ba3c20d" }
```

Блоб названо за sha256 його вмісту, малими шістнадцятковими цифрами.
Назва і є хешем, тож артефакт блоба не потребує `integrity`. Обидва
поля водночас це помилка.

### Integrity

Хеш, який мусить мати файл. Один запис або список; зі списком достатньо
збігу з будь-яким одним.

<!-- prettier-ignore -->
```js
integrity: { sha256: 'ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94' }  // 64 шістнадцяткові символи
integrity: { sha1: '149070a5480900347071b7074779531f25a6e3dc' }                            // 40
integrity: { md5: 'd41d8cd98f00b204e9800998ecf8427e' }                                     // 32
integrity: [                                                                               // будь-який із цих
  { sha1: '149070a5480900347071b7074779531f25a6e3dc' },
  { md5: 'd41d8cd98f00b204e9800998ecf8427e' },
]
```

<!-- prettier-ignore -->
```jsonc
"integrity": { "sha256": "ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94" }
```

Воно використовується двічі. Перед завантаженням файл на диску, що
збігається, зберігається. Після завантаження файл, що не збігається,
провалює встановлення.

### ExtractRule

Один крок розпакування артефакту. Є три види, їх розрізняють присутні
поля. Архів це tar, якщо його назва закінчується на `.tar`, `.tar.gz`
або `.tgz`, і zip інакше.

<!-- prettier-ignore -->
```js
// ExtractDump: увесь архів до теки
extract: {
  into: '${natives_directory}',     // рядок: тека, до якої розпакувати
  clean: true,                      // необов'язково: спорожнити `into` спочатку
  includes: ['*.so'],               // необов'язково: лише ці елементи
  excludes: ['META-INF/'],          // необов'язково: пропустити ці. Це типове
}

// ExtractScan: елементи, що збігаються
extract: {
  matches: '*',                     // рядок: які елементи брати
  into: '${java_runtime_dir}/jdk-21',
  includes: ['bin/', 'lib/'],       // необов'язково: більше шаблонів. Береться елемент, що збігається з будь-яким
  excludes: ['*.txt'],              // необов'язково: пропустити ці
  strip: ['*/'],                    // необов'язково: прибрати початкову частину назви кожного елемента
}

// ExtractPick: один елемент, записаний до одного файла
extract: {
  file: 'dgpuj.exe',                // рядок: точна назва елемента. Відсутній провалює встановлення
  into: '${dgpuj_dir}/dgpuj.exe',   // рядок: файл для запису
}

// кілька кроків на одному архіві
extract: [
  { file: 'LICENSE', into: '${root}/LICENSE.txt' },
  { matches: 'bin/*', into: '${root}/bin' },
]
```

<!-- prettier-ignore -->
```jsonc
{ "into": "${natives_directory}", "clean": true, "excludes": ["META-INF/"] }
{ "matches": "*", "into": "${java_runtime_dir}/jdk-21", "strip": ["*/"] }
{ "file": "dgpuj.exe", "into": "${dgpuj_dir}/dgpuj.exe" }
```

Шаблони елементів малі навмисно: `lib/` (назви, що починаються з
нього), `lib*`, `*.so`, `*` або точна назва. Вони не глоб-шаблони
очищення, а змінні не підставляються. `into` підставляється.

### Launch

Як запустити гру, коли файли на місці. Конфігурація пише його поля
прямо під `manifest`.

<!-- prettier-ignore -->
```js
manifest: {
  command: '@minecraft.command',        // рядок: програма для запуску
  workdir: '${game_directory}',         // рядок: тека, у якій вона працює
  args: [                               // Val[], необов'язково: її аргументи, по черзі
    '-Xmx4G',
    '@minecraft.jvmArgs',               //   '@plugin.group': що пропонує плагін, підставляє `opys build`
    '@minecraft.mainClass',
    '--username', '${auth_player_name}',
  ],
  envs: { JAVA_HOME: '${java_home}' },  // ValDefs, необов'язково: змінні середовища, додані до встановлених
}
```

<!-- prettier-ignore -->
```jsonc
"launch": {
  "command": "${java_bin}",
  "workdir": "${game_directory}",
  "args": [
    "-Xmx4G",
    { "rules": "allow.os.osx", "value": ["-XstartOnFirstThread"] },
    "-cp", "${classpath}",
    "net.minecraft.client.main.Main",
    "--username", "${auth_player_name}"
  ],
  "envs": { "JAVA_HOME": "${java_home}" }
}
```

- Маніфест не тримає жодного посилання `@…`: кожне замінюється під час
  збирання.
- Один елемент результату це один аргумент процесу. Нічого не ділиться
  за пробілами, тож шлях із пробілами безпечний.

### Val

Один елемент `args`. Їхній список це `Valset`.

<!-- prettier-ignore -->
```js
args: [
  '-Xmx4G',                                               // рядок: завжди передається
  { rules: 'allow.os.osx', value: '-XstartOnFirstThread' }, // об'єкт: передається лише там, де проходять його правила
  {
    rules: 'allow.features.has_custom_resolution',
    value: ['--width', '${resolution_width}', '--height', '${resolution_height}'], // список: кілька аргументів, одна умова
  },
]
```

<!-- prettier-ignore -->
```jsonc
"-Xmx4G"
{ "rules": "allow.os.osx", "value": "-XstartOnFirstThread" }
{
  "rules": "allow.features.has_custom_resolution",
  "value": ["--width", "${resolution_width}", "--height", "${resolution_height}"]
}
```

`rules` можна пропустити в об'єкті, який тоді завжди проходить.

### CleanupRule

Файли до видалення після встановлення: що збігається з `includes`,
мінус що збігається з `excludes`, мінус **усе, що встановив цей
маніфест**.

<!-- prettier-ignore -->
```js
manifest: {
  cleanup: [
    { includes: ['${game_directory}/mods/*.jar'] },   // string[]: шаблони файлів до видалення
    {
      includes: ['${game_directory}/config/**'],
      excludes: ['**/options.txt'],                   // string[], необов'язково: шаблони файлів для збереження
    },
  ],
}
```

<!-- prettier-ignore -->
```jsonc
"cleanup": [
  { "includes": ["${game_directory}/mods/*.jar"] },
  { "includes": ["${game_directory}/config/**"], "excludes": ["**/options.txt"] }
]
```

| Шаблон  | Збігається з          |
| ------- | --------------------- |
| `*`     | Будь-що в одній теці. |
| `?`     | Один символ у теці.   |
| `**`    | Будь-що, крізь теки.  |
| `{a,b}` | Або `a`, або `b`.     |

- Перше правило видаляє кожен jar у `mods`, який не належить цій збірці.
- Тека йде зі своїми файлами, коли залишається порожньою.
- Шаблон `includes`, що міг би сягнути надто далеко, зупиняє
  встановлення перш ніж щось завантажиться: невизначена змінна,
  відносний шлях, `..` або жодної теки перед першим символом підстановки.

## Усе разом

Одна конфігурація, яка пише кожну структуру вище, і маніфест, який з
неї робить `opys build`.

<!-- prettier-ignore -->
```js
// opys.config.mjs
import { defineConfig, files } from '@opys/dev';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    // Source { blob }: кожен файл теки переноситься в бандлі
    files({ from: 'config', to: (file) => '${game_directory}/config/' + file.rel }),
  ],
  manifest: {
    // ValDefs
    vars: {
      root: '/games/pack',
      game_directory: '${root}/',
      natives_directory: '${root}/natives',
      // ConditionalVal: перемагає останній вибір, що проходить
      java_bin: [
        { value: '${root}/jdk/bin/java' },
        { value: '${root}/jdk/bin/javaw.exe', rules: 'allow.os.windows' },
      ],
    },

    // Artifact[]
    artifacts: [
      {
        path: '${root}/libs/game.jar',
        source: { url: 'https://example.com/game-1.0.jar' },                    // Source { url }
        integrity: { sha256: 'ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94' }, // Integrity
        size: 110704,
        metadata: { from: 'my own build' },
      },
      {
        path: '${root}/natives-linux.zip',
        source: { url: 'https://example.com/natives-linux.zip' },
        integrity: [                                                            // Integrity: будь-який із цих
          { sha1: '149070a5480900347071b7074779531f25a6e3dc' },
          { md5: 'd41d8cd98f00b204e9800998ecf8427e' },
        ],
        rules: ['allow.os.linux', { action: 'allow', os: { arch: 'x86_64' } }], // Ruleset: коротке Rule і довге
        extract: { into: '${natives_directory}', clean: true },                 // ExtractDump
      },
      {
        path: '${root}/jdk.tar.gz',
        source: { url: 'https://example.com/jdk-21.tar.gz' },
        integrity: { sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08' },
        extract: [
          { matches: '*', into: '${root}/jdk', strip: ['*/'] },                 // ExtractScan
          { file: 'jdk-21/LICENSE', into: '${root}/JDK-LICENSE.txt' },          // ExtractPick
        ],
      },
    ],

    // Launch
    command: '${java_bin}',
    workdir: '${game_directory}',
    args: [
      '-Xmx4G',                                                                 // Val: рядок
      { rules: 'allow.os.osx', value: '-XstartOnFirstThread' },                 // Val: лише там, де проходять його правила
      '-cp', '${root}/libs/game.jar',
      'com.example.Main',
      { rules: 'allow.features.fullscreen', value: ['--fullscreen', 'true'] },
    ],
    envs: { PACK: 'my-pack' },

    // CleanupRule[]
    cleanup: [
      { includes: ['${game_directory}/mods/*.jar'] },
      { includes: ['${game_directory}/config/**'], excludes: ['**/options.txt'] },
    ],
  },
});
```

<!-- prettier-ignore -->
```jsonc
// manifest.json
{
  "vars": {
    "game_directory": "${root}/",
    "java_bin": [
      { "value": "${root}/jdk/bin/java" },
      { "value": "${root}/jdk/bin/javaw.exe", "rules": "allow.os.windows" }
    ],
    "natives_directory": "${root}/natives",
    "root": "/games/pack"
  },
  "launch": {
    "command": "${java_bin}",
    "workdir": "${game_directory}",
    "args": [
      "-Xmx4G",
      { "rules": "allow.os.osx", "value": ["-XstartOnFirstThread"] },
      "-cp", "${root}/libs/game.jar",
      "com.example.Main",
      { "rules": "allow.features.fullscreen", "value": ["--fullscreen", "true"] }
    ],
    "envs": { "PACK": "my-pack" }
  },
  "artifacts": [
    {
      "path": "${game_directory}/config/options.txt",
      "source": { "blob": "281c00f49eb59e9c9ec4da85960033d12444864f8f5b8392e6f5c6941f9f8caa" },
      "size": 7
    },
    {
      "path": "${root}/libs/game.jar",
      "source": { "url": "https://example.com/game-1.0.jar" },
      "size": 110704,
      "integrity": { "sha256": "ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94" },
      "metadata": { "from": "my own build" }
    },
    {
      "path": "${root}/natives-linux.zip",
      "source": { "url": "https://example.com/natives-linux.zip" },
      "rules": ["allow.os.linux", "allow.arch.x86_64"],
      "integrity": [
        { "sha1": "149070a5480900347071b7074779531f25a6e3dc" },
        { "md5": "d41d8cd98f00b204e9800998ecf8427e" }
      ],
      "extract": { "into": "${natives_directory}", "clean": true }
    },
    {
      "path": "${root}/jdk.tar.gz",
      "source": { "url": "https://example.com/jdk-21.tar.gz" },
      "integrity": { "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08" },
      "extract": [
        { "matches": "*", "into": "${root}/jdk", "strip": ["*/"] },
        { "file": "jdk-21/LICENSE", "into": "${root}/JDK-LICENSE.txt" }
      ]
    }
  ],
  "cleanup": [
    { "includes": ["${game_directory}/mods/*.jar"] },
    { "includes": ["${game_directory}/config/**"], "excludes": ["**/options.txt"] }
  ]
}
```

Що змінилося дорогою:

- Файл теки став `blob`, зі своїм `size`.
- Правило, написане в довгій формі, зберігається в короткій скрізь, де
  вона в нього є: `{ action: 'allow', os: { arch: 'x86_64' } }` це
  `"allow.arch.x86_64"`.
- `value`, написане одним рядком, зберігається як список з одного.
- `command`, `workdir`, `args` і `envs` переїхали під `launch`.

## З коду

Читати маніфест самостійно доводиться рідко: `opys` і
[`@opys/runtime`](https://www.npmjs.com/package/@opys/runtime) роблять це
за вас. Для власного інструмента перевірте маніфест, а потім спитайте, що
від нього отримує один комп'ютер.

```js
import { decodeManifest, filterManifest, resolvedArgs } from '@opys/core';

const manifest = decodeManifest({
  vars: { root: '/games/pack' },
  artifacts: [
    {
      path: '${root}/libs/a.jar',
      source: { url: 'https://example.com/a.jar' },
      integrity: { sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709' },
    },
    {
      path: '${root}/natives.zip',
      source: { url: 'https://example.com/natives-windows.zip' },
      rules: 'allow.os.windows',
    },
  ],
  launch: {
    command: 'java',
    workdir: '${root}',
    args: ['-cp', '${root}/libs/a.jar', 'Main'],
  },
});

const linux = { name: 'linux', arch: 'x86_64', version: '' };
filterManifest(manifest, linux).artifacts.length; // 1: нативи для Windows
resolvedArgs(manifest.launch, linux); // ['-cp', '${root}/libs/a.jar', 'Main']
```

## Функції

Усі вони імпортуються з `@opys/core`.

| Функція                                              | Що робить                                              |
| ---------------------------------------------------- | ------------------------------------------------------ |
| `decodeManifest(value)`, `parseManifest(text)`       | Об'єкт або текст JSON у перевірений `Manifest`.        |
| `encodeManifest(manifest)`                           | Назад до простого JSON.                                |
| `filterManifest(manifest, platform, features?)`      | Артефакти, які отримує один комп'ютер.                 |
| `resolvedArgs(launch, …)`, `resolvedEnvs(launch, …)` | Аргументи й середовище, які отримує один комп'ютер.    |
| `resolveVars(vars)`, `interpolate(text, vars)`       | Підставляють `${…}`.                                   |
| `satisfiesRuleset(rules, platform, features?)`       | Чи проходять правила на комп'ютері.                    |
| `parseShortRuleset(rules)`                           | Короткі правила в довгу форму.                         |
| `valValues(val)`, `extractRules(artifact)`           | Читають поле з двома написаннями як список.            |
| `deduplicateArtifacts(artifacts)`                    | Один артефакт на шлях. Пізніший перемагає.             |
| `globToRegex(glob)`, `globBase(glob)`                | Шаблон очищення як `RegExp` і тека, у якій він лежить. |
| `sourceUrl`, `sourceBlob`                            | Будують джерело.                                       |
| `extractDump`, `extractScan`, `extractPick`          | Будують крок `extract`.                                |

## Кожна функція

Кожна функція, з тим, що вона повертає.

<!-- prettier-ignore -->
```js
import {
  decodeManifest, parseManifest, encodeManifest,          // маніфест
  filterManifest, resolvedArgs, resolvedEnvs,             // що отримує один комп'ютер
  resolveVars, interpolate,                               // змінні
  satisfiesRuleset, parseShortRuleset,                    // правила
  valValues, extractRules,                                // поля з двома написаннями
  deduplicateArtifacts, globBase, globToRegex,            // артефакти й шаблони
  sourceUrl, sourceBlob, extractDump, extractScan, extractPick, // будівники
} from '@opys/core';

const linux = { name: 'linux', arch: 'x86_64', version: '' };
const mac = { name: 'osx', arch: 'aarch64', version: '' };

// ── маніфест
decodeManifest({ vars: {}, artifacts: [] });    // a Manifest, checked
parseManifest('{"vars":{},"artifacts":[]}');    // the same, from JSON text
encodeManifest(manifest);                       // plain JSON again
decodeManifest({ vars: {}, artifacts: [{ path: 'a', source: { url: 'u' }, nope: 1 }] });
// throws: unknown field `nope`, expected one of `path`, `source`, `size`, …

// ── що отримує один комп'ютер
filterManifest(manifest, linux);                   // without the artifacts for other systems
filterManifest(manifest, linux, ['java_console']); // with a feature switched on

resolvedArgs(manifest.launch, linux); // ['-Xmx4G', '-cp', '${root}/libs/a.jar', 'Main']
resolvedArgs(manifest.launch, mac);   // ['-Xmx4G', '-XstartOnFirstThread', '-cp', …]
resolvedEnvs(manifest.launch, linux); // { PACK: 'my-pack' }

// ── змінні
resolveVars({ root: '/games/pack', mods: '${root}/mods' });
// { root: '/games/pack', mods: '/games/pack/mods' }
interpolate('${root}/mods/${nope}', { root: '/games/pack' });
// '/games/pack/mods/${nope}': an undefined name is left as written

// ── правила
satisfiesRuleset('allow.os.linux', linux);                                       // true
satisfiesRuleset(['allow.os.linux', 'disallow.features.demo'], linux, ['demo']); // false
satisfiesRuleset({ action: 'allow', os: { name: 'osx' } }, linux);               // false
parseShortRuleset(['allow.os.osx', 'disallow.features.demo']);
// [{ action: 'allow', os: { name: 'osx' } }, { action: 'disallow', features: { demo: true } }]

// ── поля з двома написаннями
valValues('-Xmx4G');                                     // ['-Xmx4G']
valValues({ rules: 'allow.os.osx', value: ['a', 'b'] }); // ['a', 'b']
extractRules(artifact);                                  // always a list, whether one step or several

// ── артефакти й шаблони
deduplicateArtifacts([first, second]);   // same path twice: only `second` is left
globBase('/games/pack/mods/*.jar');      // '/games/pack/mods'
globToRegex('/games/pack/mods/*.jar');   // /^\/games\/pack\/mods\/[^/]*\.jar$/

// ── будівники
sourceUrl('https://example.com/a.jar'); // { url: 'https://example.com/a.jar' }
sourceBlob(id);                         // { blob: '3d862eef…' }
extractDump('${root}/natives');         // { into: '${root}/natives' }
extractScan('*', '${root}/jdk');        // { matches: '*', into: '${root}/jdk' }
extractPick('LICENSE', '${root}/LICENSE.txt');
```

`resolvedArgs` вибирає аргументи. Він не підставляє `${…}`; це робить
`interpolate`.

## Документація

- [Формат](https://harmoniya-net.github.io/opys/uk/format/): кожен елемент, по сторінці на кожен
- [`@opys/bundle`](https://www.npmjs.com/package/@opys/bundle): файл, у якому зберігається маніфест

Частина [opys](https://github.com/harmoniya-net/opys).
