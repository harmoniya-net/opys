# Modrinth

Плагін `modrinth` з `@opys/minecraft`.

Моди з Modrinth, названі за версією.

```js
modrinth({
  to: (file) => '${game_directory}/mods/' + file.filename,
  versions: [
    'JjCVwmVA', // ID
    'https://modrinth.com/mod/lithium/version/N08Z8wog', // або URL сторінки
  ],
});
```

## Параметри

| Параметр   | Що робить                          |
| ---------- | ---------------------------------- |
| `versions` | ID версій або URL сторінок версій. |
| `to`       | Куди встановлюється кожен файл.    |
| `apiBase`  | Дзеркало API Modrinth.             |

### to

Викликається один раз на файл. Повертає місце, куди цей файл
встановлюється.

| `file.`         | Це                      |
| --------------- | ----------------------- |
| `filename`      | Ім'я jar.               |
| `versionId`     | Версія, яку ви назвали. |
| `versionNumber` | Її рядок версії.        |
| `projectId`     | Проєкт мода.            |
| `size`          | Розмір у байтах.        |

Починайте шлях зі змінної, такої як `${game_directory}`. Вона
заповнюється на комп'ютері гравця.

## Що він додає

| Вид        | Що                            |
| ---------- | ----------------------------- |
| Файли      | Один на кожну названу версію. |
| Запуск     | Нічого.                       |
| Змінні     | Нічого.                       |
| Середовище | Нічого.                       |

Про кожен нижче: що це і як він опиняється у
[маніфесті](/uk/format/).

### Файли · один на версію

Головний файл версії з CDN Modrinth, зафіксований за sha1, який публікує
Modrinth. `path` це те, що повернуло ваше `to`.

<!-- prettier-ignore -->
```js{6-9}
// opys.config.mjs
export default defineConfig({
  plugins: [
    fabric({ version: '1.21.1' }),
    java({ version: '21' }),
    modrinth({
      to: (file) => '${game_directory}/mods/' + file.filename,
      versions: ['JjCVwmVA'],
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
  "path": "${game_directory}/mods/sodium-fabric-0.8.12-beta.2+mc1.21.1.jar",
  "source": { "url": "https://cdn.modrinth.com/data/AANobbMI/versions/JjCVwmVA/sodium-fabric-0.8.12-beta.2%2Bmc1.21.1.jar" },
  "size": 1573186,
  "integrity": { "sha1": "6c8b02b70540dd3330c7877277b35fabcf1c2c4b" }
}
```

Жодних фрагментів запуску і жодних змінних. Моди не змінюють того, як
гра запускається.

**Чому за версією, а не за проєктом:** «Sodium» це рухлива ціль. Одна
версія це один точний файл.

## Цілий модпак

<!-- prettier-ignore -->
```js
plugins: [
  modrinthModpack({ pack: 'xVcA1pSL' }),
  java({ version: '17' }),
],
manifest: {
  command: '@modrinthModpack.command',
  args: [
    '@modrinthModpack.jvmArgs',
    '@modrinthModpack.mainClass',
    '@modrinthModpack.gameArgs',
  ],
  workdir: '${game_directory}',
},
```

`pack` це ID версії, URL сторінки версії або пряме посилання `.mrpack`.

Він додає три речі:

| Що                             | Чому                                                                    |
| ------------------------------ | ----------------------------------------------------------------------- |
| Завантажувач, який просить пак | Пак буває Fabric, Forge, NeoForge або ванільним. Вам не треба дивитися. |
| Кожен файл клієнтського боку   | Моди і пакети ресурсів збірки.                                          |
| `overrides` збірки             | Її конфігурації, розпаковані у `${game_directory}`.                     |

Фрагменти запуску це фрагменти завантажувача під ім'ям `modrinthModpack`.
Тож рядок запуску однаковий, який би завантажувач пак не використовував.

`loader: (spec) => …` дозволяє налаштувати завантажувач самостійно,
наприклад з дзеркалом. Паки Quilt не підтримуються.

## Варто знати

- opys встановлює те, що ви назвали. Він не перевіряє мод на відповідність
  вашому завантажувачу або версії Minecraft.
- Залежності мода не додаються. Перелічіть їх.
- Одне `to` на плагін. Для другої теки додайте плагін знову і
  перейменуйте його: `.as('resourcepacks')`.
- Модпак не каже, яку Java хоче. Додайте [`java`](./java).
