# Forge

Плагін `forge` з `@opys/minecraft`.

Forge для будь-якої версії Minecraft від 1.1.

<!-- prettier-ignore -->
```js{4,8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    forge({ version: '1.20.1' }),
    java({ version: '17' }),
  ],
  manifest: {
    command: '@forge.command',
    args: [
      '@forge.jvmArgs',
      '@forge.mainClass',
      '@forge.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

Використовуйте його **замість** `minecraft`. Завантажувач привозить
гру з собою.

## Параметри

| Параметр       | Що робить                                                                           |
| -------------- | ----------------------------------------------------------------------------------- |
| `version`      | Яка збірка. Див. нижче.                                                             |
| `source`       | Дзеркало індексу збірок.                                                            |
| `manifestBase` | Дзеркало списку версій Mojang.                                                      |
| `libraries`    | Бібліотеки для [додавання або заміни](./minecraft#додавання-або-заміна-бібліотеки). |

### version

| Ви пишете              | Ви отримуєте                                                   |
| ---------------------- | -------------------------------------------------------------- |
| `'1.20.1'`             | Рекомендована збірка або найновіша, якщо рекомендованої немає. |
| `'1.20.1-latest'`      | Найновіша збірка.                                              |
| `'1.20.1-recommended'` | Рекомендована збірка.                                          |
| `'1.20.1-47.4.10'`     | Саме ця збірка.                                                |

Версія визначається **під час збирання**. `'1.20.1'` сьогодні і за
шість місяців може означати різні збірки. Для збірки, яка ніколи
не рухається, пишіть точну версію.

## Що він додає

Усе, що додає [ванільний Minecraft](./minecraft#що-він-додає), з
такими відмінностями.

| Вид        | Що                                             |
| ---------- | ---------------------------------------------- |
| Файли      | Бібліотеки Forge, поверх гри.                  |
| Запуск     | `command`, `jvmArgs`, `mainClass`, `gameArgs`. |
| Змінні     | Ті самі, що [ванільні](./minecraft#змінні).    |
| Середовище | Немає.                                         |

Кожен пункт нижче: що це таке і як воно потрапляє в
[маніфест](/uk/format/).

### Файли · бібліотеки Forge

Власні jar Forge із сервера Forge. Бібліотека гри, яку Forge
замінює, відкидається, а не завантажується двічі.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    forge({ version: '1.20.1' }),
    java({ version: '17' }),
  ],
  manifest: {
    command: '@forge.command',
    args: [
      '@forge.jvmArgs',
      '@forge.mainClass',
      '@forge.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${library_directory}/cpw/mods/modlauncher/10.0.9/modlauncher-10.0.9.jar",
  "source": { "url": "https://maven.minecraftforge.net/cpw/mods/modlauncher/10.0.9/modlauncher-10.0.9.jar" },
  "size": 130343,
  "integrity": { "sha1": "06d9443f56f50bb85cea383686ff9c867391458b" }
}
```

### Запуск

Ванільний рядок запуску з двома змінами: головний клас це
**horno**, і рядки, які кажуть йому, що встановлювати. horno це
малий помічник, який завершує встановлення завантажувача на
комп'ютері гравця, а потім запускає гру.

<!-- prettier-ignore -->
```js{8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    forge({ version: '1.20.1' }),
    java({ version: '17' }),
  ],
  manifest: {
    command: '@forge.command',
    args: [
      '@forge.jvmArgs',
      '@forge.mainClass',
      '@forge.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"launch": {
  // '@forge.command'
  "command": "${java_bin}",
  "args": [
    // '@forge.jvmArgs'
    // … ванільні аргументи JVM, далі:
    "-cp",
    "${classpath}",
    "-Dhorno.librariesDir=${library_directory}",
    "-Dhorno.installer=${library_directory}/net/minecraftforge/forge/1.20.1-47.4.10/forge-1.20.1-47.4.10-installer.jar",
    "-Dhorno.installerUrl=https://maven.minecraftforge.net/…/forge-1.20.1-47.4.10-installer.jar",
    "-Dhorno.installerSha1=66bfea9963bfa60d88bab6b2750e74a958392715",
    "-Dhorno.minecraft=${library_directory}/com/mojang/minecraft/1.20.1/minecraft-1.20.1-client.jar",
    // '@forge.mainClass'
    "net.harmoniya.horno.Main",
    // '@forge.gameArgs'
    "--username", "${auth_player_name}",
    // … ванільні аргументи гри, далі:
    "--launchTarget", "forgeclient",
    "--fml.forgeVersion", "47.4.10",
    "--fml.mcVersion", "1.20.1"
  ],
  "workdir": "${game_directory}"
}
```

| Ви пишете            | Стає                                             |
| -------------------- | ------------------------------------------------ |
| `'@forge.command'`   | Програма для запуску: та Java, яку має збірка.   |
| `'@forge.jvmArgs'`   | Аргументи для самої Java, в кінці з classpath.   |
| `'@forge.mainClass'` | Клас для старту. Один аргумент.                  |
| `'@forge.gameArgs'`  | Аргументи для гри: хто грає і де що знаходиться. |

### Змінні

Ті самі імена, що у ванільної версії. `classpath` тепер має
бібліотеки цього завантажувача перед бібліотеками гри.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    forge({ version: '1.20.1' }),
    java({ version: '17' }),
  ],
  manifest: {
    command: '@forge.command',
    args: [
      '@forge.jvmArgs',
      '@forge.mainClass',
      '@forge.gameArgs',
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
  // … решта, як у ванільній версії
}
```

**Чому перший запуск повільніший:** тоді horno робить свою
роботу. Нічого налаштовувати. `opys install` робить це заздалегідь.

## Варто знати

- Forge 1.7.2 потребує Java 7: `java({ version: '7', vendor: 'zulu' })`.
- Forge 1.16.4 потребує Java 8 не новішої за 8u312:
  `java({ version: '8u312-b07' })`.
- Десять ранніх бета-версій 1.5 (таких як `1.5-7.7.0.559`) не
  встановлюються. Файл, який їм потрібен, більше не існує.
  `'1.5'` вибирає пізнішу збірку.
- Поєднуйте його з [`java({ version: '17' })`](./java#яка-java-для-якого-minecraft).
