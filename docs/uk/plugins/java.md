# Середовище Java

Плагін `java` з `@opys/minecraft`.

Середовище Java для кожного гравця.

```js
java({ version: '21' });
```

Нічого не встановлюється на ваш комп'ютер. Плагін додає JDK до
збірки, і кожен гравець завантажує той, що підходить його комп'ютеру.

**Чому не Java гравця:** у більшості гравців її немає або не та версія.
Збірка, що привозить власну, запускається завжди.

## Параметри

| Параметр    | Що робить                                                    |
| ----------- | ------------------------------------------------------------ |
| `version`   | Мажорна (`'21'`, її найновіший випуск) або точна збірка.     |
| `vendor`    | `'temurin'` (за замовчуванням), `'zulu'` або `'graalvm'`.    |
| `platforms` | Яким платформам дістанеться JDK. За замовчуванням усі шість. |
| `apiBase`   | Дзеркало API постачальника.                                  |
| `token`     | Токен GitHub для обмеження частоти запитів GraalVM.          |

Точна збірка пишеться так, як її пише постачальник: `'21.0.12.1+1'`
або `'8u312-b07'` для Temurin, `'21.0.12'` для Zulu і GraalVM.

## Яка Java для якого Minecraft

| Minecraft            | Java |
| -------------------- | ---- |
| До 1.16.5            | 8    |
| Від 1.17 до 1.20.4   | 17   |
| Від 1.20.5 до 1.21.x | 21   |
| 26.x                 | 25   |
| Cleanroom, lwjgl3ify | 25   |

opys не перевіряє цю пару. Неправильна Java проявляється тим, що гра не
запускається.

## Власна Java комп'ютера

`java({ system: true })` не привозить JDK. Гра працює на Java, яка вже
встановлена, і нічого не завантажується.

```js
plugins: [minecraft({ version: '1.21.1' }), java({ system: true })],
```

| Прапорець `custom_java`     | `java_bin`                                    |
| --------------------------- | --------------------------------------------- |
| вимкнено (за замовчуванням) | `java`, знайдена у `PATH`.                    |
| увімкнено                   | `${java_home}/bin/java`, зі змінної лаунчера. |

У Windows це `javaw` або `java` з прапорцем `java_console`, як і для
привезеного JDK.

Щоб гравець міг вибрати власну Java, опишіть обидва варіанти у
[налаштуваннях](/uk/basics/config#параметри) конфігурації:

```js
options: options()
  .feature('custom_java', (o) => o.directory('java_home').title('Java folder'))
  .title('Use my own Java'),
```

- `java_home` це тека JDK, та, що містить `bin`. У macOS це
  `…/Contents/Home`.
- Він додає одну змінну, `java_bin`, і один фрагмент запуску,
  `'@java.bin'`. Немає `'@java.home'`, бо збірка не знає, де лежить JDK.
- `JAVA_HOME` задається для гри, лише коли `custom_java` увімкнено.
- Жоден інший параметр не поєднується з `system`.
  `java({ system: true, version: '21' })` зупиняє збирання: opys не може
  обіцяти, яка Java є на комп'ютері.

**Чому прапорець?** Маніфест не може спитати, чи була задана змінна.
Його правила перевіряють ОС і прапорці, і нічого більше. Тому «гравець
назвав Java» має бути прапорцем.

**Коли це використовувати:** сервер, який ви тримаєте самі, або збірка
для людей, які самі керують своєю Java. Для гравців привозьте JDK. Це
єдиний спосіб знати, яку Java отримає гра.

## Що він додає

| Вид        | Що                                           |
| ---------- | -------------------------------------------- |
| Файли      | Один JDK на платформу.                       |
| Запуск     | `bin`, `home`.                               |
| Змінні     | `java_runtime_dir`, `java_home`, `java_bin`. |
| Середовище | `JAVA_HOME`.                                 |

Про кожен нижче: що це і як він опиняється у
[маніфесті](/uk/format/).

### Файли · один JDK на платформу

Шість архівів: Linux, macOS і Windows, кожна на x86_64 і ARM. Завдяки
`rules` гравець завантажує рівно один. `extract` розпаковує його.

<!-- prettier-ignore -->
```js{5}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@java.bin',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${java_runtime_dir}/OpenJDK21U-jdk_x64_linux_hotspot_21.0.12.1_1.tar.gz",
  "source": { "url": "https://github.com/adoptium/temurin21-binaries/releases/download/…_x64_linux_….tar.gz" },
  "size": 207473347,
  "rules": ["allow.os.linux", "allow.arch.x86_64"],
  "integrity": { "sha256": "ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94" },
  "extract": { "matches": "*", "into": "${java_runtime_dir}/jdk-21", "strip": ["*/"] }
}
```

### Змінні

Де лежить JDK. Шляхи різняться між ОС, тому це змінні з одним
значенням на платформу.

<!-- prettier-ignore -->
```js{5}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@java.bin',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"vars": {
  "java_runtime_dir": "${root}/runtimes",
  "java_home": [
    { "value": "${java_runtime_dir}/jdk-21", "rules": "allow.os.linux" },
    { "value": "${java_runtime_dir}/jdk-21/Contents/Home", "rules": "allow.os.osx" },
    { "value": "${java_runtime_dir}/jdk-21", "rules": "allow.os.windows" }
  ],
  "java_bin": [
    { "value": "${java_home}/bin/java", "rules": "allow.os.linux" },
    { "value": "${java_home}/bin/java", "rules": "allow.os.osx" },
    { "value": "${java_home}/bin/javaw.exe", "rules": ["allow.os.windows", "disallow.features.java_console"] },
    { "value": "${java_home}/bin/java.exe", "rules": ["allow.os.windows", "allow.features.java_console"] }
  ]
}
```

Перевизначте `java_runtime_dir`, щоб тримати JDK в іншому місці.

### Запуск

Два фрагменти. `bin` ви називаєте рідко, бо `command` завантажувача вже
вказує на нього. `home` для того, що запускає Java замість вас,
наприклад [дискретної відеокарти](./dgpuj#як-вказати-де-java).

<!-- prettier-ignore -->
```js{11-12}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
    dgpuj(),
  ],
  manifest: {
    command: '@dgpuj.bin',
    args: [
      '--dgpuj-home',
      '@java.home',
      '@minecraft.jvmArgs',
      '@minecraft.mainClass',
      '@minecraft.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"launch": {
  "command": "${dgpuj_bin}",
  "args": [
    "--dgpuj-home",
    // '@java.home'
    "${java_home}"
    // …
  ]
}
```

| Ви пишете      | Стає                                     |
| -------------- | ---------------------------------------- |
| `'@java.bin'`  | `${java_bin}`, виконуваний файл `java`.  |
| `'@java.home'` | `${java_home}`, тека, в якій лежить JDK. |

**Чому фрагменти, коли є `${java_bin}` і `${java_home}`:** фрагмент
перевіряється під час збирання. Неправильно написана змінна ні.

### Середовище · `JAVA_HOME`

Задається для процесу гри. Інструменти, запущені разом із грою,
знаходять Java через неї.

<!-- prettier-ignore -->
```js{5}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@java.bin',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"envs": { "JAVA_HOME": "${java_home}" }
```

## Прапорці

| Прапорець      | Ефект                                               |
| -------------- | --------------------------------------------------- |
| `java_console` | У Windows запускати `java.exe` замість `javaw.exe`. |
| `custom_java`  | З `system: true` запускати Java з `${java_home}`.   |

**Чому:** `javaw.exe` не показує вікна консолі, чого гравці і хочуть.
`opys launch --feature java_console` повертає вивід гри, коли ви
налагоджуєте.

## Варто знати

- Платформа, для якої постачальник не має збірки, пропускається.
  Гравець на ній не отримує Java.
- **Перевіряйте, що видав Zulu.** Його API відповідає найновішим JDK,
  коли не може прочитати версію. Дивіться рядок `[java]`, який друкує
  збирання.
- Зовсім немає Java у збірці? Використайте `java({ system: true })`.
  Див. [Власна Java комп'ютера](#власна-java-комп-ютера).
