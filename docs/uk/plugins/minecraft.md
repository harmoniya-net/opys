# Ванільний Minecraft

Плагін `minecraft` з `@opys/minecraft`.

Гра так, як її постачає Mojang, без завантажувача модів.

<!-- prettier-ignore -->
```js{4,8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: [
      '@minecraft.jvmArgs',
      '@minecraft.mainClass',
      '@minecraft.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

Кожен плагін завантажувача побудовано на цьому, тож ця сторінка описує
і те, що в них усіх спільного.

## Параметри

| Параметр       | Що робить                                                                            |
| -------------- | ------------------------------------------------------------------------------------ |
| `version`      | Версія Minecraft. Якщо пропущено, поточний випуск.                                   |
| `libraries`    | Бібліотеки, щоб додати або замінити. Див. [нижче](#додавання-або-заміна-бібліотеки). |
| `manifestBase` | Дзеркало списку версій Mojang.                                                       |

Називайте версію. Сам `minecraft()` бере ту, що є поточною на день
збирання.

## Що він додає

| Вид        | Що                                             |
| ---------- | ---------------------------------------------- |
| Файли      | Jar гри, бібліотеки, нативні файли, ресурси.   |
| Запуск     | `command`, `jvmArgs`, `mainClass`, `gameArgs`. |
| Змінні     | Теки і те, що повідомляють грі.                |
| Середовище | Нічого.                                        |

Про кожен нижче: що це і як він опиняється у
[маніфесті](/uk/format/).

### Файли · jar гри

Один файл. Зафіксовано хешем, який публікує Mojang.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: [
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
{
  "path": "${version_dir}/client.jar",
  "source": { "url": "https://piston-data.mojang.com/v1/objects/30c7…/client.jar" },
  "size": 26836906,
  "integrity": { "sha1": "30c73b1c5da787909b2f73340419fdf13b9def88" }
}
```

### Файли · бібліотеки

Близько сотні jar. Той, що має нативний код, має `rules`, щоб гравець
Windows не завантажував нативні файли Linux, і `extract`, який його
розпаковує.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: [
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
{
  "path": "${library_directory}/org/lwjgl/lwjgl-freetype/3.3.3/lwjgl-freetype-3.3.3-natives-linux.jar",
  "source": { "url": "https://libraries.minecraft.net/org/lwjgl/…-natives-linux.jar" },
  "size": 1245129,
  "rules": "allow.os.linux",
  "integrity": { "sha1": "149070a5480900347071b7074779531f25a6e3dc" },
  "extract": { "into": "${natives_directory}", "clean": true, "excludes": ["META-INF/"] }
}
```

### Файли · ресурси

Звуки, текстури, мови: кілька тисяч малих файлів та індекс, який їх
перелічує. Це більша частина маніфесту.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: [
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
{
  "path": "${assets_root}/objects/b6/b62ca8ec10d07e6bf5ac8dae0c8c1d2e6a1e3356",
  "source": { "url": "https://resources.download.minecraft.net/b6/b62c…" },
  "size": 9101,
  "integrity": { "sha1": "b62ca8ec10d07e6bf5ac8dae0c8c1d2e6a1e3356" },
  "metadata": { "name": "icons/icon_128x128.png" }
}
```

### Запуск

Весь командний рядок у вигляді чотирьох фрагментів, які ви складаєте по
порядку. Останні аргументи гри вмикаються [прапорцями](#прапорці).

<!-- prettier-ignore -->
```js{8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: [
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
  // '@minecraft.command'
  "command": "${java_bin}",
  "args": [
    // '@minecraft.jvmArgs'
    { "rules": "allow.os.osx", "value": ["-XstartOnFirstThread"] },
    "-Djava.library.path=${natives_directory}",
    "-Dminecraft.launcher.brand=${launcher_name}",
    // … ще кілька
    "-cp",
    "${classpath}",
    // '@minecraft.mainClass'
    "net.minecraft.client.main.Main",
    // '@minecraft.gameArgs'
    "--username", "${auth_player_name}",
    "--version", "${version_name}",
    "--gameDir", "${game_directory}",
    "--assetsDir", "${assets_root}",
    "--uuid", "${auth_uuid}",
    "--accessToken", "${auth_access_token}",
    // … ще кілька
    { "rules": "allow.features.is_demo_user", "value": ["--demo"] },
    {
      "rules": "allow.features.has_custom_resolution",
      "value": ["--width", "${resolution_width}", "--height", "${resolution_height}"]
    }
  ],
  "workdir": "${game_directory}"
}
```

| Ви пишете                | Стає                                             |
| ------------------------ | ------------------------------------------------ |
| `'@minecraft.command'`   | Програма для запуску: та Java, що її має збірка. |
| `'@minecraft.jvmArgs'`   | Аргументи самої Java, наприкінці з classpath.    |
| `'@minecraft.mainClass'` | Клас для старту. Один аргумент.                  |
| `'@minecraft.gameArgs'`  | Аргументи гри: хто грає і де що лежить.          |

**Чому чотири фрагменти:** щоб ви могли покласти власні аргументи між
ними. Прапорці JVM ідуть перед головним класом, прапорці гри після.

### Змінні

Три групи. Усі вони у `vars` маніфесту.

#### Теки

Усе тримається на `root`. Пересуньте `root`, і пересунеться все
встановлення. Використовуйте їх у `to` і у власних шляхах.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"vars": {
  "root": ".",
  "game_directory": "${root}/",                       // збереження, моди, налаштування
  "library_directory": "${root}/libraries",
  "assets_root": "${root}/assets",
  "version_dir": "${root}/versions/${version_name}",  // jar гри
  "natives_directory": "${version_dir}/natives"
}
```

#### Гравець

Гра очікує ці імена. Кожне вказує на змінну, яку маніфест **не**
визначає.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"vars": {
  "auth_player_name": "${username}",
  "auth_uuid": "${uuid}",
  "auth_access_token": "${token}",
  "auth_session": "${token}"
}
```

Отже, `username`, `uuid` і `token` **залишені відкритими** разом із
`root`. Задайте їх у [`run`](/uk/basics/config#run), через `--var` або з
лаунчера.

| Ім'я       | Що це                           | Якщо його пропущено                     |
| ---------- | ------------------------------- | --------------------------------------- |
| `root`     | Тека, у яку все встановлюється. | `.`, поточна тека. Завжди задавайте її. |
| `username` | Ім'я гравця.                    | Гра отримає текст `${username}`.        |
| `uuid`     | ID гравця.                      | Гра отримає текст `${uuid}`.            |
| `token`    | Токен доступу. `0` грає офлайн. | Гра отримає текст `${token}`.           |

**Чому відкриті:** вони різняться для кожного гравця, а бандл один для
всіх.

#### Що повідомляють грі

Їх можна ігнорувати. Власні аргументи гри посилаються на них.

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"vars": {
  "version_name": "1.21.1",
  "version_type": "release",
  "assets_index_name": "17",
  "game_assets": "${assets_root}",
  "launcher_name": "opys",
  "launcher_version": "0.2.0",
  "user_type": "mojang",
  "user_properties": "{}",
  "clientid": "",
  "classpath_separator": [
    { "value": ";", "rules": "allow.os.windows" },
    { "value": ":", "rules": "allow.os.linux" },
    { "value": ":", "rules": "allow.os.osx" }
  ],
  "classpath": [/* кожна бібліотека, потім jar гри, на кожну ОС */]
}
```

## Прапорці

Перемикачі, які лаунчер або `--feature` можуть увімкнути. Ці два з
власних даних гри:

| Прапорець               | Ефект                                                                         |
| ----------------------- | ----------------------------------------------------------------------------- |
| `has_custom_resolution` | Передає розмір вікна. Також задайте `resolution_width` і `resolution_height`. |
| `is_demo_user`          | Запускає гру в деморежимі.                                                    |

```sh
opys launch --feature has_custom_resolution \
  --var resolution_width=1280 --var resolution_height=720
```

## Додавання або заміна бібліотеки

Кожен завантажувач приймає `libraries` для бібліотеки, якої гра не має,
або виправленої копії тієї, що має:

```js
forge({
  version: '1.20.1',
  libraries: [
    {
      name: 'com.google.code.gson:gson:2.11.0',
      artifact: {
        path: 'com/google/code/gson/gson/2.11.0/gson-2.11.0.jar',
        source: { file: 'libs/gson-2.11.0.jar' },
      },
    },
  ],
}),
```

| Поле              | Що це                                                  |
| ----------------- | ------------------------------------------------------ |
| `name`            | `group:artifact:version`.                              |
| `artifact.path`   | Куди jar лягає всередині теки `libraries`.             |
| `artifact.source` | `{ url }` або `{ file }` поруч із вашою конфігурацією. |

Решта `artifact` це звичайний [артефакт](/uk/format/artifacts):
`integrity`, `rules`, `extract`.

- `file` подорожує всередині бандла.
- `url` без `integrity` завантажується раз під час збирання, щоб
  зафіксувати його хеш.
- Ваші бібліотеки ідуть **першими** у classpath.

**Однакова назва замінює.** Та, що має той самий `group:artifact`, що й
бібліотека, яку використовує гра, стає на її місце в кожній операційній
системі. Приклад замінює Gson гри.

**Чому в кожній ОС:** перевизначення ціле. Якщо ви обмежите власне однією
ОС через `rules`, решта не отримає жодної копії. Додайте запис на кожну
ОС.

## Варто знати

- Не перелічуйте `minecraft()` поруч із завантажувачем. Завантажувач уже
  включає його, і ви отримаєте попередження за кожну продубльовану
  змінну.
- Він не додає Java. Додайте [`java`](./java).
