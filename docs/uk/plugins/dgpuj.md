# Дискретна відеокарта

Плагін `dgpuj` з `@opys/minecraft`.

Запускає гру на швидкій відеокарті.

<!-- prettier-ignore -->
```js{6,9,11-12}
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

На ноутбуці з двома відеокартами Windows і Linux вибирають одну
для кожної програми і часто вибирають повільну для Java.

**Чому лаунчер не може виправити це ззовні:** вибір належить
процесу, який відкриває вікно. Тому
[dgpuj](https://github.com/harmoniya-net/dgpuj) _стає_ цим
процесом. Він просить швидку карту, а потім запускає Java всередині
себе.

## Параметри

| Параметр                   | Що робить                                                           |
| -------------------------- | ------------------------------------------------------------------- |
| `version`                  | `'latest'` (за замовчуванням), `'prerelease'` або тег (`'v0.3.0'`). |
| `platforms`                | Які платформи його отримують.                                       |
| `repo`, `token`, `apiBase` | Звідки він завантажується, і токен GitHub.                          |

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
{
  "path": "${dgpuj_dir}/dgpuj-x86_64-pc-windows-msvc.zip",
  "source": { "url": "https://github.com/harmoniya-net/dgpuj/releases/download/v0.3.0/dgpuj-x86_64-pc-windows-msvc.zip" },
  "size": 77321,
  "rules": ["allow.os.windows", "allow.arch.x86_64"],
  "integrity": { "sha256": "3dc7ef481abdd390cbb0ba23137d808b4b8652b23a49915f761a4bc422969a13" },
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
"command": "${dgpuj_bin}"
```

Це єдиний випадок, коли `command` приходить не від
завантажувача.

## Як вказати, де Java

```js
args: ['--dgpuj-home', '@java.home', '@forge.jvmArgs', …],
```

`--dgpuj-home` це власний прапорець dgpuj, а
[`@java.home`](./java#що-він-додає) це JDK, який встановив плагін
`java`. Поставте цю пару першою в `args`.

**Чому `dgpuj` не дає цього сам:** де знаходиться Java, каже
плагін `java`. За такої назви конфігурація без `java` падає під
час збирання замість старту зі зламаним шляхом.

Пару можна пропустити. `java` також встановлює `JAVA_HOME`, а
dgpuj читає її.

## Варто знати

- Він постачається для Windows і macOS на x86_64 і ARM, а для
  Linux на x86_64. Збірки Linux ARM немає.
- На macOS примушувати нічого, тому він лише запускає Java.
- На Linux він діє, лише коли присутній пропрієтарний драйвер
  NVIDIA.
