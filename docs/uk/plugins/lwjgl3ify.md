# lwjgl3ify

Плагін `lwjgl3ify` з `@opys/minecraft`.

[lwjgl3ify](https://github.com/GTNewHorizons/lwjgl3ify): моди Forge 1.7.10
на сучасній Java.

<!-- prettier-ignore -->
```js{4,8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    lwjgl3ify({ version: '1.7.10' }),
    java({ version: '25' }),
  ],
  manifest: {
    command: '@lwjgl3ify.command',
    args: [
      '@lwjgl3ify.jvmArgs',
      '@lwjgl3ify.mainClass',
      '@lwjgl3ify.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

Використовуйте його **замість** `minecraft`. Завантажувач привозить гру
з собою.

## Параметри

| Параметр    | Що робить                                                                           |
| ----------- | ----------------------------------------------------------------------------------- |
| `version`   | Яка збірка. Див. нижче.                                                             |
| `source`    | Дзеркало індексу збірок.                                                            |
| `unimixins` | `false`, щоб не додавати UniMixins, або `{ version, repo }`, щоб вибрати інші.      |
| `repo`      | Репозиторій GitHub, звідки береться jar мода.                                       |
| `token`     | Токен GitHub для обмеження частоти запитів.                                         |
| `apiBase`   | Дзеркало API GitHub.                                                                |
| `libraries` | Бібліотеки, щоб [додати або замінити](./minecraft#додавання-або-заміна-бібліотеки). |

### version

| Ви пишете              | Ви отримуєте                                                      |
| ---------------------- | ----------------------------------------------------------------- |
| `'1.7.10'`             | Рекомендований випуск або найновіший, якщо рекомендованого немає. |
| `'1.7.10-latest'`      | Найновіший випуск.                                                |
| `'1.7.10-recommended'` | Рекомендований випуск.                                            |
| `'3.0.37'`             | Саме цей випуск.                                                  |

Версія визначається **під час збирання**. `'1.7.10'` сьогодні і за шість
місяців може означати різні випуски. Для збірки, яка ніколи не рухається,
пишіть точний.

## Що він додає

Усе, що додає [ванільний Minecraft](./minecraft#що-він-додає), з такими
відмінностями.

| Вид        | Що                                                  |
| ---------- | --------------------------------------------------- |
| Файли      | Гра 1.7.10 з бібліотеками lwjgl3ify і **два моди**. |
| Запуск     | `command`, `jvmArgs`, `mainClass`, `gameArgs`.      |
| Змінні     | Ті самі, що у [ванільної](./minecraft#змінні).      |
| Середовище | Нічого.                                             |

Про кожен нижче: що це і як він опиняється у
[маніфесті](/uk/format/).

### Файли · два моди у `mods/`

Мод lwjgl3ify і UniMixins, без якого він не стартує. Обидва з випусків
GitHub, зафіксовані за sha256.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    lwjgl3ify({ version: '1.7.10' }),
    java({ version: '25' }),
  ],
  manifest: {
    command: '@lwjgl3ify.command',
    args: [
      '@lwjgl3ify.jvmArgs',
      '@lwjgl3ify.mainClass',
      '@lwjgl3ify.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${game_directory}/mods/lwjgl3ify-3.0.37.jar",
  "source": { "url": "https://github.com/GTNewHorizons/lwjgl3ify/releases/download/3.0.37/lwjgl3ify-3.0.37.jar" },
  "size": 8266971,
  "integrity": { "sha256": "3c5af555d62eb9b7f4196adea94cb4cbd4c8efe3e1d512f83537aa88d9d5211e" }
},
{
  "path": "${game_directory}/mods/+unimixins-all-1.7.10-0.3.2.jar",
  "source": { "url": "https://github.com/LegacyModdingMC/UniMixins/releases/download/0.3.2/%2Bunimixins-all-1.7.10-0.3.2.jar" },
  "size": 5520080,
  "integrity": { "sha256": "2687b776c8503e0b60cd8413cf70eaabb836c19f9fc726280ef61d6612257034" }
}
```

### Запуск

Довгий. Гра 2014 року на сучасній Java потребує багатьох дверей,
відчинених вручну.

<!-- prettier-ignore -->
```js{8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    lwjgl3ify({ version: '1.7.10' }),
    java({ version: '25' }),
  ],
  manifest: {
    command: '@lwjgl3ify.command',
    args: [
      '@lwjgl3ify.jvmArgs',
      '@lwjgl3ify.mainClass',
      '@lwjgl3ify.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"launch": {
  // '@lwjgl3ify.command'
  "command": "${java_bin}",
  "args": [
    // '@lwjgl3ify.jvmArgs'
    "-Djava.library.path=${natives_directory}",
    "-cp",
    "${classpath}",
    "-Djava.system.class.loader=com.gtnewhorizons.retrofuturabootstrap.RfbSystemClassLoader",
    "--add-opens", "java.base/java.io=ALL-UNNAMED",
    "--add-opens", "java.base/java.lang=ALL-UNNAMED"
    // … ще близько сорока --add-opens
    // '@lwjgl3ify.mainClass'
    "com.gtnewhorizons.retrofuturabootstrap.MainStartOnFirstThread",
    // '@lwjgl3ify.gameArgs'
    "--username", "${auth_player_name}",
    // … решта аргументів гри 1.7.10, далі:
    "--tweakClass", "cpw.mods.fml.common.launcher.FMLTweaker"
  ],
  "workdir": "${game_directory}"
}
```

| Ви пишете                | Стає                                             |
| ------------------------ | ------------------------------------------------ |
| `'@lwjgl3ify.command'`   | Програма для запуску: та Java, що її має збірка. |
| `'@lwjgl3ify.jvmArgs'`   | Аргументи самої Java, наприкінці з classpath.    |
| `'@lwjgl3ify.mainClass'` | Клас для старту. Один аргумент.                  |
| `'@lwjgl3ify.gameArgs'`  | Аргументи гри: хто грає і де що лежить.          |

### Змінні

Ті самі імена, що у ванільної. `classpath` тепер має бібліотеки цього
завантажувача попереду гри.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    lwjgl3ify({ version: '1.7.10' }),
    java({ version: '25' }),
  ],
  manifest: {
    command: '@lwjgl3ify.command',
    args: [
      '@lwjgl3ify.jvmArgs',
      '@lwjgl3ify.mainClass',
      '@lwjgl3ify.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"vars": {
  "game_directory": "${root}/",
  "library_directory": "${root}/libraries",
  // … решта, як у ванільної
}
```

**Чому моди додаються за вас:** якщо забути будь-який, гра не
запуститься, а помилка не скаже чому.

## Варто знати

- Він замінює і `minecraft`, і `forge`.
- Передавайте `unimixins: false`, лише якщо ваша збірка привозить власне
  середовище міксинів.
- Обидва моди з GitHub. Передайте `token`, якщо збирання впирається в
  обмеження частоти.
- Поєднуйте його з [`java({ version: '25' })`](./java#яка-java-для-якого-minecraft).
