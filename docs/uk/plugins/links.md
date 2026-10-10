# Файли за посиланням

Плагін `links` з `@opys/minecraft`.

Будь-який файл, на який у вас є URL.

Він не прив'язаний до Minecraft: посилання є посилання. Сьогодні сайти,
які він знає на ім'я, це переважно місця, де живуть моди, а будь-який
інший URL усе одно працює.

```js
links({
  to: (file) => '${game_directory}/mods/' + file.filename,
  links: [
    'https://modrinth.com/mod/sodium/version/JjCVwmVA',
    'https://github.com/owner/repo/releases/download/v1.2/mod.jar',
    'https://github.com/owner/repo/releases/latest/download/mod.jar',
    'https://example.com/files/custom-mod.jar',
  ],
});
```

## Параметри

| Параметр          | Що робить                                                      |
| ----------------- | -------------------------------------------------------------- |
| `links`           | URL.                                                           |
| `to`              | Куди встановлюється кожен файл.                                |
| `curseforgeToken` | Обов'язковий для посилань CurseForge.                          |
| `githubToken`     | Підвищує ліміт частоти GitHub. Відкриває приватні репозиторії. |
| `gitlabToken`     | Відкриває приватні проєкти GitLab.                             |

Є також `githubApi`, `modrinthApi` і `curseforgeApi` для дзеркал.

### to

Викликається один раз на файл. Повертає місце, куди цей файл
встановлюється.

| `file.`     | Це                                                      |
| ----------- | ------------------------------------------------------- |
| `filename`  | Ім'я файлу.                                             |
| `link`      | Посилання так, як ви його написали.                     |
| `url`       | Звідки він справді завантажується.                      |
| `provider`  | `github`, `gitlab`, `modrinth`, `curseforge` або `url`. |
| `size`      | Розмір у байтах.                                        |
| `integrity` | Хеш, яким його зафіксовано.                             |

Починайте шлях зі змінної, такої як `${game_directory}`. Вона
заповнюється на комп'ютері гравця.

## Що він додає

| Вид        | Що                 |
| ---------- | ------------------ |
| Файли      | Один на посилання. |
| Запуск     | Нічого.            |
| Змінні     | Нічого.            |
| Середовище | Нічого.            |

Про кожен нижче: що це і як він опиняється у
[маніфесті](/uk/format/).

### Файли · посилання на сайт, який він знає

Сайт каже, що це за файл і який у нього хеш. Тут Modrinth.

<!-- prettier-ignore -->
```js{6-9}
// opys.config.mjs
export default defineConfig({
  plugins: [
    fabric({ version: '1.21.1' }),
    java({ version: '21' }),
    links({
      to: (file) => '${game_directory}/mods/' + file.filename,
      links: ['https://modrinth.com/mod/sodium/version/SMxNOGZ6'],
    }),
  ],
  manifest: {
    command: '@fabric.command',
    args: ['@fabric.jvmArgs', '@fabric.mainClass', '@fabric.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${game_directory}/mods/sodium-fabric-0.8.13+mc1.21.1.jar",
  "source": { "url": "https://cdn.modrinth.com/data/AANobbMI/versions/SMxNOGZ6/sodium-fabric-0.8.13%2Bmc1.21.1.jar" },
  "size": 1574609,
  "integrity": { "sha1": "003c114c85ca88ef3362e018deb6aca0c682d6a1" }
}
```

### Файли · будь-яке інше посилання

Ніхто не публікує хеш, тому opys завантажує файл один раз під час
збирання і хешує його сам. Це `sha256` нижче.

<!-- prettier-ignore -->
```js{6-9}
// opys.config.mjs
export default defineConfig({
  plugins: [
    fabric({ version: '1.21.1' }),
    java({ version: '21' }),
    links({
      to: (file) => '${game_directory}/mods/' + file.filename,
      links: ['https://maven.fabricmc.net/…/fabric-api-0.116.0+1.21.1.jar'],
    }),
  ],
  manifest: {
    command: '@fabric.command',
    args: ['@fabric.jvmArgs', '@fabric.mainClass', '@fabric.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${game_directory}/mods/fabric-api-0.116.0+1.21.1.jar",
  "source": { "url": "https://maven.fabricmc.net/…/fabric-api-0.116.0+1.21.1.jar" },
  "size": 2410624,
  "integrity": { "sha256": "8604ed0741bd16f82dceb13f3ad2db28b002a9cd7972da74325530f65a31e939" }
}
```

Звідки береться хеш:

| Посилання                 | Звідки хеш                        |
| ------------------------- | --------------------------------- |
| Файл випуску GitHub       | Дайджест GitHub для нього.        |
| Файл пакета GitLab        | Реєстр.                           |
| Сторінка версії Modrinth  | Modrinth.                         |
| Сторінка файла CurseForge | CurseForge.                       |
| Будь-що інше              | opys завантажує його раз і хешує. |

**Чому останній рядок важливий:** зафіксувати можна _будь-який_ файл, а
не лише файли на хості, що публікує хеші.

Жодних фрагментів запуску і жодних змінних.

## Варто знати

- **`latest` означає найновіший сьогодні.** Посилання `releases/latest`
  фіксується на випуску, який є найновішим на час збирання. Зберіть знову,
  щоб рухатися вперед.
- **Сторінка це не файл.** `https://modrinth.com/mod/lithium` це
  вебсторінка, і opys встановить саме цю сторінку. Посилайтеся на версію
  або на файл.
- Для файла на власному диску використовуйте [`files`](./files).
