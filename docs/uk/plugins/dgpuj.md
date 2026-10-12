# Дискретна відеокарта

Плагін `dgpuj` з `@opys/minecraft`.

Запускає гру на швидкій відеокарті.

<!-- prettier-ignore -->
```js{6,9,11}
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
      '@minecraft.command',
      '@minecraft.jvmArgs',
      '@minecraft.mainClass',
      '@minecraft.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

На ноутбуці з двома відеокартами Windows і Linux вибирають одну
для кожної програми і часто вибирають повільну для Java.

**Чому лаунчер не може виправити це ззовні:** вибір належить
процесу, який відкриває вікно. Тому
[dgpuj](https://github.com/harmoniya-net/dgpuj) _стає_ цим
процесом. Він просить швидку карту, а потім запускає Java всередині
себе.

## Параметри

| Параметр                   | Що робить                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `version`                  | Без нього це випуск, для якого написана ця версія opys. Або `'latest'`, `'prerelease'` чи тег (`'v0.6.0'`). |
| `platforms`                | Які платформи його отримують.                                                                               |
| `repo`, `token`, `apiBase` | Звідки він завантажується, і токен GitHub.                                                                  |

## Що він додає

| Вид        | Що                                    |
| ---------- | ------------------------------------- |
| Файли      | По одному малому архіву на платформу. |
| Запуск     | `bin`.                                |
| Змінні     | `dgpuj_dir`, `dgpuj_bin`.             |
| Середовище | Немає.                                |

Кожен пункт нижче: що це таке і як воно потрапляє в
[маніфест](/uk/format/).

### Файли · по одному архіву на платформу

П'ять архівів. `rules` вибирають той, що для комп'ютера гравця, а
`extract` дістає з нього єдиний виконуваний файл.

<!-- prettier-ignore -->
```js{6}
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
      '@minecraft.command',
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
  "path": "${dgpuj_dir}/dgpuj-x86_64-pc-windows-msvc.zip",
  "source": { "url": "https://github.com/harmoniya-net/dgpuj/releases/download/v0.6.0/dgpuj-x86_64-pc-windows-msvc.zip" },
  "size": 947,
  "rules": ["allow.os.windows", "allow.arch.x86_64"],
  "integrity": { "sha256": "d90a21ccc99625b450b897b10ac34bd4e36b7fbf03cbd7172133160f2d794fa4" },
  "extract": { "file": "dgpuj.exe", "into": "${dgpuj_dir}/dgpuj.exe" }
}
```

### Змінні

Де знаходиться виконуваний файл, для кожної ОС.

<!-- prettier-ignore -->
```js{6}
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
      '@minecraft.command',
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
"vars": {
  "dgpuj_dir": "${root}/dgpuj",
  "dgpuj_bin": [
    { "value": "${dgpuj_dir}/dgpuj.exe", "rules": "allow.os.windows" },
    { "value": "${dgpuj_dir}/dgpuj", "rules": "allow.os.linux" },
    { "value": "${dgpuj_dir}/dgpuj", "rules": "allow.os.osx" }
  ]
}
```

### Запуск · `@dgpuj.bin`

Виконуваний файл dgpuj. Він іде в `command`, бо саме він має бути
програмою, яка стартує.

<!-- prettier-ignore -->
```js{9}
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
      '@minecraft.command',
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
"command": "${dgpuj_bin}"
```

Це єдиний випадок, коли `command` приходить не від
завантажувача.

**Чому версія типово не найновіша:** те, що ви пишете в `args`, це
власний командний рядок dgpuj, і він змінювався між випусками. Кожна
версія opys називає той випуск, який описує її документація, тож
збірка отримує саме його, і той самий у кожному збиранні.

## Як вказати, яку Java запускати

```js
args: ['@forge.command', '@forge.jvmArgs', …],
```

dgpuj стає перед звичайним рядком запуску. Перший аргумент це
`java`, яку він має запустити, а це вже і є `command`
завантажувача. Тож `command` завантажувача переходить із `command`
на початок `args`.

Це може бути шлях або просто слово `java`, тому
[`java({ system: true })`](./java) тут теж працює.

**Чому `dgpuj` не дає цього сам:** яка Java запускає гру, каже
завантажувач. За такої назви конфігурація без завантажувача падає
під час збирання замість старту зі зламаним шляхом.

**Java 8 у Windows** це виняток. Вона знаходить власні файли за
місцем свого запускача, тому dgpuj має лежати поруч із `java.exe`,
у теці `bin` JDK, і отримати просто слово `java`.

## Варто знати

- Він постачається для Windows і macOS на x86_64 і ARM, а для
  Linux на x86_64. Збірки Linux ARM немає.
- На macOS примушувати нічого, тому він лише запускає Java.
- На Linux він діє, лише коли присутній пропрієтарний драйвер
  NVIDIA.
