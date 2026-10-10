# NeoForge

Плагін `neoforge` з `@opys/minecraft`.

NeoForge для Minecraft 1.20.2 і новіших.

<!-- prettier-ignore -->
```js{4,8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    neoforge({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@neoforge.command',
    args: [
      '@neoforge.jvmArgs',
      '@neoforge.mainClass',
      '@neoforge.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

Використовуйте його **замість** `minecraft`. Завантажувач привозить гру
з собою.

## Параметри

| Параметр       | Що робить                                                                           |
| -------------- | ----------------------------------------------------------------------------------- |
| `version`      | Яка збірка. Див. нижче.                                                             |
| `source`       | Дзеркало індексу збірок.                                                            |
| `manifestBase` | Дзеркало списку версій Mojang.                                                      |
| `libraries`    | Бібліотеки, щоб [додати або замінити](./minecraft#додавання-або-заміна-бібліотеки). |

### version

| Ви пишете              | Ви отримуєте                                                   |
| ---------------------- | -------------------------------------------------------------- |
| `'1.21.1'`             | Рекомендована збірка або найновіша, якщо рекомендованої немає. |
| `'1.21.1-latest'`      | Найновіша збірка.                                              |
| `'1.21.1-recommended'` | Рекомендована збірка.                                          |
| `'21.1.172'`           | Саме ця збірка.                                                |

Версія визначається **під час збирання**. `'1.21.1'` сьогодні і за шість
місяців може означати різні збірки. Для збірки, яка ніколи не рухається,
пишіть точну.

## Що він додає

Усе, що додає [ванільний Minecraft](./minecraft#що-він-додає), з такими
відмінностями.

| Вид        | Що                                             |
| ---------- | ---------------------------------------------- |
| Файли      | Бібліотеки NeoForge поверх гри.                |
| Запуск     | `command`, `jvmArgs`, `mainClass`, `gameArgs`. |
| Змінні     | Ті самі, що у [ванільної](./minecraft#змінні). |
| Середовище | Нічого.                                        |

Про кожен нижче: що це і як він опиняється у
[маніфесті](/uk/format/).

### Файли · бібліотеки NeoForge

Власні jar NeoForge із сервера NeoForge.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    neoforge({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@neoforge.command',
    args: [
      '@neoforge.jvmArgs',
      '@neoforge.mainClass',
      '@neoforge.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${library_directory}/cpw/mods/modlauncher/11.0.5/modlauncher-11.0.5.jar",
  "source": { "url": "https://maven.neoforged.net/releases/cpw/mods/modlauncher/11.0.5/modlauncher-11.0.5.jar" },
  "size": 116486,
  "integrity": { "sha1": "b8f0d49294f733fdb6173931b263553e943dc950" }
}
```

### Запуск

Ванільний командний рядок із двома змінами: головний клас це **horno**,
а рядки кажуть йому, що встановити. horno це малий помічник, який
завершує встановлення завантажувача на комп'ютері гравця, а потім
запускає гру.

<!-- prettier-ignore -->
```js{8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    neoforge({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@neoforge.command',
    args: [
      '@neoforge.jvmArgs',
      '@neoforge.mainClass',
      '@neoforge.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"launch": {
  // '@neoforge.command'
  "command": "${java_bin}",
  "args": [
    // '@neoforge.jvmArgs'
    // … ванільні аргументи JVM, далі:
    "-cp",
    "${classpath}",
    "-Dhorno.librariesDir=${library_directory}",
    "-Dhorno.installer=${library_directory}/net/neoforged/neoforge/21.1.256/neoforge-21.1.256-installer.jar",
    "-Dhorno.installerUrl=https://maven.neoforged.net/releases/…/neoforge-21.1.256-installer.jar",
    "-Dhorno.installerSha1=9d85f6e652996e83f05ead32120317e1ef056590",
    "-Dhorno.minecraft=${library_directory}/com/mojang/minecraft/1.21.1/minecraft-1.21.1-client.jar",
    // '@neoforge.mainClass'
    "net.harmoniya.horno.Main",
    // '@neoforge.gameArgs'
    "--username", "${auth_player_name}",
    // … ванільні аргументи гри, далі:
    "--fml.neoForgeVersion", "21.1.256",
    "--fml.mcVersion", "1.21.1",
    "--launchTarget", "forgeclient"
  ],
  "workdir": "${game_directory}"
}
```

| Ви пишете               | Стає                                             |
| ----------------------- | ------------------------------------------------ |
| `'@neoforge.command'`   | Програма для запуску: та Java, що її має збірка. |
| `'@neoforge.jvmArgs'`   | Аргументи самої Java, наприкінці з classpath.    |
| `'@neoforge.mainClass'` | Клас для старту. Один аргумент.                  |
| `'@neoforge.gameArgs'`  | Аргументи гри: хто грає і де що лежить.          |

### Змінні

Ті самі імена, що у ванільної. `classpath` тепер має бібліотеки цього
завантажувача попереду гри.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    neoforge({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@neoforge.command',
    args: [
      '@neoforge.jvmArgs',
      '@neoforge.mainClass',
      '@neoforge.gameArgs',
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

**Чому перший запуск повільніший:** тоді horno робить свою роботу.
Нічого налаштовувати. `opys install` робить це заздалегідь.

## Варто знати

- Збірка з кваліфікатором, таким як `-beta`, ніколи не «рекомендована».
- Java: 17 для 1.20.2 до 1.20.4, 21 для 1.20.5 до 1.21.x, 25 для 26.x.
- Поєднуйте його з [`java({ version: '21' })`](./java#яка-java-для-якого-minecraft).
