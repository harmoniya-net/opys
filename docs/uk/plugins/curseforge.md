# CurseForge

Плагін `curseforge` з `@opys/minecraft`.

Моди з CurseForge, названі за файлом.

```js
curseforge({
  token: process.env.CURSEFORGE_TOKEN,
  to: (file) => '${game_directory}/mods/' + file.filename,
  files: [
    6717445, // ID файла
    'https://www.curseforge.com/minecraft/mc-mods/jei/files/6307712', // або його URL
  ],
});
```

## Параметри

| Параметр  | Що робить                          |
| --------- | ---------------------------------- |
| `files`   | ID файлів або URL сторінок файлів. |
| `to`      | Куди встановлюється кожен файл.    |
| `token`   | Ключ API CurseForge. Обов'язковий. |
| `apiBase` | Дзеркало API CurseForge.           |

**Чому потрібен токен:** у CurseForge немає анонімного API.
Візьміть ключ з [їхньої консолі](https://console.curseforge.com/)
і читайте його із середовища, щоб конфігурацію можна було
зберігати в репозиторії.

```sh
CURSEFORGE_TOKEN=your-key opys build
```

### to

Викликається один раз для кожного файла. Повертає місце, куди
цей файл встановлюється.

| `file.`     | Що це                  |
| ----------- | ---------------------- |
| `filename`  | Ім'я jar.              |
| `fileId`    | Файл, який ви назвали. |
| `projectId` | Проєкт мода.           |
| `size`      | Розмір у байтах.       |

Починайте шлях зі змінної, такої як `${game_directory}`. Вона
заповнюється на комп'ютері гравця.

## Що він додає

| Вид        | Що                                |
| ---------- | --------------------------------- |
| Файли      | По одному на кожен названий файл. |
| Запуск     | Немає.                            |
| Змінні     | Немає.                            |
| Середовище | Немає.                            |

Кожен пункт нижче: що це таке і як воно потрапляє в
[маніфест](/uk/format/).

### Файли · по одному на ID файла

З CDN CurseForge, закріплені за sha1, який публікує CurseForge.
`path` це те, що повернула ваша функція `to`.

<!-- prettier-ignore -->
```js{6-10}
// opys.config.mjs
export default defineConfig({
  plugins: [
    forge({ version: '1.20.1' }),
    java({ version: '17' }),
    curseforge({
      token: process.env.CURSEFORGE_TOKEN,
      to: (file) => '${game_directory}/mods/' + file.filename,
      files: [6307712],
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
  "path": "${game_directory}/mods/<the file's name>.jar",
  "source": { "url": "https://edge.forgecdn.net/files/…/<the file's name>.jar" },
  "size": 1234567,
  "integrity": { "sha1": "…" }
}
```

Немає фрагментів запуску і немає змінних.

**Токен не додається.** Він використовується під час збирання.
URL завантаження публічні, тому гравцям токен ніколи не потрібен.

## Цілий модпак

```js
plugins: [
  curseforgeModpack({ token: process.env.CURSEFORGE_TOKEN, file: 1040985 }),
  java({ version: '17' }),
],
```

Він додає завантажувач, який просить збірка, кожен її мод і
`overrides` збірки, розпаковані в `${game_directory}`.

Фрагменти запуску це фрагменти завантажувача під іменем
`curseforgeModpack`: `'@curseforgeModpack.jvmArgs'` і так далі.
Збірки Quilt не підтримуються.

## Варто знати

- Мод називається за ID його **файла**, числом після `/files/`,
  а не за ID проєкту.
- Залежності мода не додаються. Перелічіть їх.
- Модпак не каже, яку Java він хоче. Додайте [`java`](./java).
