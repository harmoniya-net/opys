# @opys/java

[![npm](https://img.shields.io/npm/v/@opys/java.svg)](https://www.npmjs.com/package/@opys/java)

Java для opys. `java()` додає JDK до збірки, щоб гравцям не треба було
нічого встановлювати.

```sh
npm install -D @opys/dev @opys/java @opys/minecraft-vanilla
```

## Приклад

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { java } from '@opys/java';
import { minecraft } from '@opys/minecraft-vanilla';

export default defineConfig({
  output: 'game.opys',
  plugins: [minecraft({ version: '1.21.1' }), java({ version: '21' })],
  manifest: {
    command: '@minecraft.command',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Параметри

| Параметр    | Що робить                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------- |
| `version`   | Мажорна (`'21'`, її найновіший випуск) або точна збірка (`'21.0.12.1+1'`, `'8u312-b07'`).     |
| `vendor`    | `'temurin'` (типово), `'zulu'` або `'graalvm'`.                                               |
| `platforms` | Які платформи отримують JDK. Типово всі шість.                                                |
| `apiBase`   | Дзеркало API постачальника.                                                                   |
| `token`     | Токен GitHub, для ліміту частоти GraalVM.                                                     |
| `system`    | `true` не везе JDK і вживає власну Java комп'ютера. Не поєднується з жодним іншим параметром. |

Яка Java для якого Minecraft:

| Minecraft            | Java |
| -------------------- | ---- |
| До 1.16.5            | 8    |
| Від 1.17 до 1.20.4   | 17   |
| Від 1.20.5 до 1.21.x | 21   |
| 26.x                 | 25   |
| Cleanroom, lwjgl3ify | 25   |

opys не перевіряє цю пару.

## Власна Java комп'ютера

`java({ system: true })` не везе JDK. Гра працює на Java, яку вже
встановлено.

```js
plugins: [minecraft({ version: '1.21.1' }), java({ system: true })],
```

Нічого не завантажується. Плагін лише каже, де знаходиться `java`:

| Прапорець `custom_java` | `java_bin`                                    |
| ----------------------- | --------------------------------------------- |
| вимкнено (типово)       | `java`, знаходиться в `PATH`.                 |
| увімкнено               | `${java_home}/bin/java`, зі змінної лаунчера. |

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"vars": {
  "java_bin": [
    { "value": "java" },
    { "value": "javaw", "rules": ["allow.os.windows", "disallow.features.java_console"] },
    { "value": "${java_home}/bin/java", "rules": "allow.features.custom_java" },
    { "value": "${java_home}/bin/javaw.exe", "rules": ["allow.os.windows", "allow.features.custom_java", "disallow.features.java_console"] },
    { "value": "${java_home}/bin/java.exe", "rules": ["allow.os.windows", "allow.features.custom_java", "allow.features.java_console"] }
  ]
},
"launch": {
  "envs": { "JAVA_HOME": [{ "value": "${java_home}", "rules": "allow.features.custom_java" }] }
}
```

Дайте гравцю вибрати свою Java двома налаштуваннями:

```js
options: options()
  .feature('custom_java', (o) => o.directory('java_home').title('Java folder'))
  .title('Use my own Java'),
```

- `java_home` це тека JDK, та, що тримає `bin`. На macOS це
  `…/Contents/Home`.
- У нього є лише `'@java.bin'`. Немає `'@java.home'`, бо збірка не
  знає, де знаходиться JDK.
- Жоден інший параметр не поєднується з `system`.
  `java({ system: true, version: '21' })` відхиляється: opys не може
  обіцяти, яка Java є на комп'ютері.
- Версія ніяк не перевіряється. Неправильна Java показує себе тим, що
  гра не стартує.

## Що він додає

`opys build` перетворює плагін на ці частини маніфесту.

### Файли · один JDK на платформу

Шість архівів. `rules` означають, що гравець завантажує рівно один.

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

### Запуск

Дві частини. Команда `command` завантажувача вже розгортається в `bin`.
`home` для того, що стартує Java за вас.

| Ви пишете      | У маніфесті      |
| -------------- | ---------------- |
| `'@java.bin'`  | `"${java_bin}"`  |
| `'@java.home'` | `"${java_home}"` |

### Змінні

Де знаходиться JDK, для кожної ОС.

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

### Середовище

Встановлюється для процесу гри.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"envs": { "JAVA_HOME": "${java_home}" }
```

## Кожен параметр

Кожен параметр, у кожному способі використання.

```js
// найновіший випуск мажорної версії
java({ version: '21' });

// одна точна збірка: та сама в кожному збиранні збірки
java({ version: '21.0.12.1+1' });
java({ version: '8u312-b07' });

// інший постачальник
java({ version: '21', vendor: 'zulu' });
java({ version: '21', vendor: 'graalvm', token: process.env.GITHUB_TOKEN });

// лише деякі платформи, для збірки, що працює лише на Windows
java({
  version: '21',
  platforms: [
    { os: 'windows', arch: 'x86_64' },
    { os: 'windows', arch: 'aarch64' },
  ],
});

// дзеркало API постачальника
java({ version: '21', apiBase: 'https://mirror.example.com/adoptium/v3' });

// без JDK: власна Java комп'ютера
java({ system: true });
java({ system: true, version: '21' });
// збирання падає: java({ system: true }) не везе JDK, тому `version` немає до чого застосуватися
```

## Документація

- [Повна сторінка](https://harmoniya-net.github.io/opys/uk/plugins/java): кожен параметр, і чому він так працює
- [Формат](https://harmoniya-net.github.io/opys/uk/format/): з чого складається маніфест

Частина [opys](https://github.com/harmoniya-net/opys). Також експортується з [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
