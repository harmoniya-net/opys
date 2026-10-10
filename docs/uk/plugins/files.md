# Локальні файли

Плагін `files` з `@opys/dev`.

Тека на вашому диску, встановлюється як є.

```js
files({ from: 'config', to: (file) => '${game_directory}/config/' + file.rel });
```

## Параметри

| Параметр | Що робить                                            |
| -------- | ---------------------------------------------------- |
| `from`   | Тека відносно файла конфігурації.                    |
| `to`     | Куди встановлюється кожен файл.                      |
| `url`    | Де розміщено кожен файл. Необов'язково. Див. нижче.  |
| `hash`   | З `url`: `'sha1'` (за замовчуванням) або `'sha256'`. |

Береться кожен файл під `from`, включно з підтеками.

### to

Викликається один раз для кожного файла. Повертає місце, куди
цей файл встановлюється.

| `file.`    | Що це                                       |
| ---------- | ------------------------------------------- |
| `rel`      | Шлях усередині `from`: `jei/settings.toml`. |
| `filename` | Лише ім'я: `settings.toml`.                 |
| `dir`      | Лише тека: `jei`.                           |
| `abs`      | Повний шлях на вашому комп'ютері.           |
| `size`     | Розмір у байтах.                            |

Починайте шлях зі змінної, такої як `${game_directory}`. Вона
заповнюється на комп'ютері гравця.

## Що він додає

| Вид        | Що                                                  |
| ---------- | --------------------------------------------------- |
| Файли      | По одному на файл у теці. Перенесені або розміщені. |
| Запуск     | Немає.                                              |
| Змінні     | Немає.                                              |
| Середовище | Немає.                                              |

Кожен пункт нижче: що це таке і як воно потрапляє в
[маніфест](/uk/format/).

### Файли · перенесені (без `url`)

Кожен файл стає **блобом**: він подорожує всередині бандла,
названий за своїм sha256. Нічого розміщувати.

<!-- prettier-ignore -->
```js{6-9}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
    files({
      from: 'config',
      to: (file) => '${game_directory}/config/' + file.rel,
    }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${game_directory}/config/settings.txt",
  "source": { "blob": "ce197604769b1b0722bf112fe55718fa0f27ca5f02cef058be2e13a641ac38ed" },
  "size": 35
}
```

**Чому це за замовчуванням:** ніщо не може загубитися пізніше.
Забуте завантаження не може зламати збірку.

### Файли · розміщені (з `url`)

Кожен файл стає **завантаженням** з вашої адреси, закріпленим за
своїм хешем. Бандл тримає вказівник, а файли завантажуєте ви.

<!-- prettier-ignore -->
```js{6-10}
// opys.config.mjs
export default defineConfig({
  plugins: [
    forge({ version: '1.20.1' }),
    java({ version: '17' }),
    files({
      from: 'mods',
      to: (file) => '${game_directory}/mods/' + file.rel,
      url: (file) => 'https://cdn.example.com/mods/' + file.rel,
    }),
  ],
  manifest: {
    command: '@forge.command',
    args: ['@forge.jvmArgs', '@forge.mainClass', '@forge.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${game_directory}/mods/my-mod.jar",
  "source": { "url": "https://cdn.example.com/mods/my-mod.jar" },
  "size": 48213,
  "integrity": { "sha1": "…" }
}
```

**Коли:** файли великі. Див.
[перенесені або розміщені](/uk/basics/bundle#де-ваші-власні-фаили).

Немає фрагментів запуску і немає змінних.

## Варто знати

- Символічні посилання не відстежуються.
- Фільтруйте через `.exclude('**/*.bak')`. Див.
  [Налаштування плагіна](/uk/basics/config#налаштування-плагіна).
- Усе в теці стає читабельним для кожного, хто має бандл.
  Тримайте секрети поза нею.
