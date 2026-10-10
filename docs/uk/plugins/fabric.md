# Fabric

Плагін `fabric` з `@opys/minecraft`.

Fabric для будь-якої версії Minecraft, яку підтримує Fabric.

<!-- prettier-ignore -->
```js{4,8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    fabric({ version: '1.21.4' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@fabric.command',
    args: [
      '@fabric.jvmArgs',
      '@fabric.mainClass',
      '@fabric.gameArgs',
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
| `loader`       | Версія завантажувача Fabric. Якщо пропущено: найновіша стабільна.                   |
| `source`       | Дзеркало Fabric Meta.                                                               |
| `manifestBase` | Дзеркало списку версій Mojang.                                                      |
| `libraries`    | Бібліотеки для [додавання або заміни](./minecraft#додавання-або-заміна-бібліотеки). |

### version

Звичайна версія Minecraft. У Fabric немає псевдонімів.

```js
fabric({ version: '1.21.4' }); // найновіший стабільний завантажувач Fabric
fabric({ version: '1.21.4', loader: '0.16.10' }); // закріплений
```

Без `loader` використовується найновіший стабільний завантажувач,
тому він може змінюватися між збираннями. Закріпіть його для
збірки, яка ніколи не рухається.

## Що він додає

Усе, що додає [ванільний Minecraft](./minecraft#що-він-додає), з
такими відмінностями.

| Вид        | Що                                                 |
| ---------- | -------------------------------------------------- |
| Файли      | Завантажувач Fabric і його бібліотеки, поверх гри. |
| Запуск     | `command`, `jvmArgs`, `mainClass`, `gameArgs`.     |
| Змінні     | Ті самі, що [ванільні](./minecraft#змінні).        |
| Середовище | Немає.                                             |

Кожен пункт нижче: що це таке і як воно потрапляє в
[маніфест](/uk/format/).

### Файли · бібліотеки Fabric

Завантажувач Fabric і те, що йому потрібно, із сервера Fabric.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    fabric({ version: '1.21.4' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@fabric.command',
    args: [
      '@fabric.jvmArgs',
      '@fabric.mainClass',
      '@fabric.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${library_directory}/net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar",
  "source": { "url": "https://maven.fabricmc.net/net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar" }
}
```

### Запуск

Ванільний рядок запуску з головним класом Fabric і одним рядком,
який каже Fabric, який клас є справжньою грою.

<!-- prettier-ignore -->
```js{8-13}
// opys.config.mjs
export default defineConfig({
  plugins: [
    fabric({ version: '1.21.4' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@fabric.command',
    args: [
      '@fabric.jvmArgs',
      '@fabric.mainClass',
      '@fabric.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"launch": {
  // '@fabric.command'
  "command": "${java_bin}",
  "args": [
    // '@fabric.jvmArgs'
    // … ванільні аргументи JVM, далі:
    "-cp",
    "${classpath}",
    "-DFabricMcEmu= net.minecraft.client.main.Main ",
    // '@fabric.mainClass'
    "net.fabricmc.loader.impl.launch.knot.KnotClient",
    // '@fabric.gameArgs'
    "--username", "${auth_player_name}",
    "--version", "${version_name}"
    // … ванільні аргументи гри
  ],
  "workdir": "${game_directory}"
}
```

| Ви пишете             | Стає                                             |
| --------------------- | ------------------------------------------------ |
| `'@fabric.command'`   | Програма для запуску: та Java, яку має збірка.   |
| `'@fabric.jvmArgs'`   | Аргументи для самої Java, в кінці з classpath.   |
| `'@fabric.mainClass'` | Клас для старту. Один аргумент.                  |
| `'@fabric.gameArgs'`  | Аргументи для гри: хто грає і де що знаходиться. |

### Змінні

Ті самі імена, що у ванільної версії. `classpath` тепер має
бібліотеки цього завантажувача перед бібліотеками гри.

<!-- prettier-ignore -->
```js{4}
// opys.config.mjs
export default defineConfig({
  plugins: [
    fabric({ version: '1.21.4' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@fabric.command',
    args: [
      '@fabric.jvmArgs',
      '@fabric.mainClass',
      '@fabric.gameArgs',
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

Нічого не запускається на комп'ютері гравця до гри. У Fabric
немає кроку встановлення.

## Варто знати

- Поєднуйте його з [`java({ version: '21' })`](./java#яка-java-для-якого-minecraft).
