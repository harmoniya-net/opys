# Cleanroom

Плагін `cleanroom` з `@opys/minecraft`.

[Cleanroom](https://github.com/CleanroomMC/Cleanroom): моди Forge
1.12.2 на сучасному середовищі Java.

<!-- prettier-ignore -->
```js{4,8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    cleanroom({ version: '1.12.2' }),
    java({ version: '25' }),
  ],
  manifest: {
    command: '@cleanroom.command',
    args: [
      '@cleanroom.jvmArgs',
      '@cleanroom.mainClass',
      '@cleanroom.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

Використовуйте його **замість** `minecraft`. Завантажувач привозить
гру з собою.

## Параметри

| Параметр    | Що робить                                                                           |
| ----------- | ----------------------------------------------------------------------------------- |
| `version`   | Яка збірка. Див. нижче.                                                             |
| `source`    | Дзеркало індексу збірок.                                                            |
| `libraries` | Бібліотеки для [додавання або заміни](./minecraft#додавання-або-заміна-бібліотеки). |

### version

| Ви пишете              | Ви отримуєте                                                      |
| ---------------------- | ----------------------------------------------------------------- |
| `'1.12.2'`             | Рекомендований випуск або найновіший, якщо рекомендованого немає. |
| `'1.12.2-latest'`      | Найновіший випуск.                                                |
| `'1.12.2-recommended'` | Рекомендований випуск.                                            |
| `'0.6.13-alpha'`       | Саме цей випуск.                                                  |

Версія визначається **під час збирання**. `'1.12.2'` сьогодні і за
шість місяців може означати різні випуски. Для збірки, яка ніколи
не рухається, пишіть точну версію.

## Що він додає

Усе, що додає [ванільний Minecraft](./minecraft#що-він-додає), з
такими відмінностями.

| Вид        | Що                                             |
| ---------- | ---------------------------------------------- |
| Файли      | Гра 1.12.2 з бібліотеками Cleanroom.           |
| Запуск     | `command`, `jvmArgs`, `mainClass`, `gameArgs`. |
| Змінні     | Ті самі, що [ванільні](./minecraft#змінні).    |
| Середовище | Немає.                                         |

Кожен пункт нижче: що це таке і як воно потрапляє в
[маніфест](/uk/format/).

### Файли · гра і бібліотеки Cleanroom

Гра 1.12.2, у якій стару графічну бібліотеку (LWJGL 2) замінено на
поточну (LWJGL 3). Стара взагалі не встановлюється.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    cleanroom({ version: '1.12.2' }),
    java({ version: '25' }),
  ],
  manifest: {
    command: '@cleanroom.command',
    args: [
      '@cleanroom.jvmArgs',
      '@cleanroom.mainClass',
      '@cleanroom.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${library_directory}/com/cleanroommc/cleanroom/0.6.13-alpha/cleanroom-0.6.13-alpha.jar",
  "source": { "url": "https://github.com/CleanroomMC/Cleanroom/releases/download/0.6.13-alpha/cleanroom-0.6.13-alpha-universal.jar" },
  "size": 6505649,
  "integrity": { "sha1": "8d59eda7065f26fc0c1bbd3a9fa9f272ff89917f" }
}
```

### Запуск

Короткий. Версії 1.12.2 потрібно мало, а Cleanroom стартує через
власний головний клас.

<!-- prettier-ignore -->
```js{8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    cleanroom({ version: '1.12.2' }),
    java({ version: '25' }),
  ],
  manifest: {
    command: '@cleanroom.command',
    args: [
      '@cleanroom.jvmArgs',
      '@cleanroom.mainClass',
      '@cleanroom.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"launch": {
  // '@cleanroom.command'
  "command": "${java_bin}",
  "args": [
    // '@cleanroom.jvmArgs'
    "-Djava.library.path=${natives_directory}",
    "-cp",
    "${classpath}",
    // '@cleanroom.mainClass'
    "top.outlands.foundation.boot.Foundation",
    // '@cleanroom.gameArgs'
    "--username", "${auth_player_name}",
    // … решта аргументів гри 1.12.2, далі:
    "--tweakClass", "net.minecraftforge.fml.common.launcher.FMLTweaker",
    "--versionType", "Forge"
  ],
  "workdir": "${game_directory}"
}
```

| Ви пишете                | Стає                                             |
| ------------------------ | ------------------------------------------------ |
| `'@cleanroom.command'`   | Програма для запуску: та Java, яку має збірка.   |
| `'@cleanroom.jvmArgs'`   | Аргументи для самої Java, в кінці з classpath.   |
| `'@cleanroom.mainClass'` | Клас для старту. Один аргумент.                  |
| `'@cleanroom.gameArgs'`  | Аргументи для гри: хто грає і де що знаходиться. |

### Змінні

Ті самі імена, що у ванільної версії. `classpath` тепер має
бібліотеки цього завантажувача перед бібліотеками гри.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    cleanroom({ version: '1.12.2' }),
    java({ version: '25' }),
  ],
  manifest: {
    command: '@cleanroom.command',
    args: [
      '@cleanroom.jvmArgs',
      '@cleanroom.mainClass',
      '@cleanroom.gameArgs',
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

Нічого не запускається на комп'ютері гравця до гри.

## Варто знати

- Він замінює і `minecraft`, і `forge`.
- Використовуйте Java 25 незалежно від того, що каже версія
  Minecraft. opys не перевіряє.
- Поєднуйте його з [`java({ version: '25' })`](./java#яка-java-для-якого-minecraft).
