# @opys/minecraft-resources

[![npm](https://img.shields.io/npm/v/@opys/minecraft-resources.svg)](https://www.npmjs.com/package/@opys/minecraft-resources)

Моди, ресурспаки, шейдери й плагіни для opys, зібрані в одному файлі TOML.
`resources()` додає кожен перелічений у ньому файл, закріплений його хешем,
у теку, до якої він належить.

```sh
npm install -D @opys/dev @opys/minecraft-resources
```

## Приклад

```toml
# resources.toml
[common.mods]
fabric-api = "modrinth:fabric-api@0.116.17+1.21.1"
lithium    = "modrinth:lithium@mc1.21.1-0.15.4-fabric"
geckolib   = "modrinth:geckolib@4.9.3#fabric"

[client.mods]
sodium       = "modrinth:sodium@mc1.21.1-0.8.13-fabric"
mouse-tweaks = "curseforge:mouse-tweaks@5437294"

[client.resourcepacks]
faithful = "modrinth:faithful-32x@1.21.1-june-2026"

[server.plugins]
luckperms = "modrinth:luckperms@v5.5.71-bukkit"
```

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { resources, readResources } from '@opys/minecraft-resources';

const pack = resources(readResources('resources.toml'));

export default defineConfig({
  plugins: [
    // …ваш завантажувач і java…
    pack.client,
  ],
});
```

`resources()` дає плагін для кожної сторони. `pack.client` встановлює
таблиці `[common.…]` і `[client.…]`; конфіг серверного паку читає той самий
файл і бере `pack.server`.

## Файл

Таблиця має вигляд `[<сторона>.<тека>]`. Сторона це `common`, `client` або
`server`. Кожен рядок у ній це один файл:

```toml
<назва> = "<звідки він береться>"
```

### Назва

Назва це те, як файл називається після встановлення. Розширення додається
за вас: `sodium = "modrinth:sodium@…"` встановлює `mods/sodium.jar`.

Це зроблено навмисно. Опублікований файл названо за його версією,
`sodium-fabric-0.8.13+mc1.21.1.jar`, тож наступна версія була б новим файлом
поруч зі старим. Назва, яку обрали ви, не змінюється, тому оновлення заміняє
файл.

- Назва з крапкою береться цілком, без жодних додатків:
  `"options.txt" = "file:defaults/options.txt"`.
- Назва вживається один раз на теку. Та сама назва в `[common.mods]` і
  `[client.mods]` зупиняє збірку.

### Звідки він береться

| Ви пишете                                   | Що це                                 |
| ------------------------------------------- | ------------------------------------- |
| `modrinth:<проєкт>@<версія>`                | Проєкт Modrinth і одна з його версій. |
| `modrinth:<проєкт>@<версія>#<завантажувач>` | Те саме, для одного завантажувача.    |
| `curseforge:<проєкт>@<id файлу>`            | Файл CurseForge.                      |
| `file:<шлях>`                               | Файл на вашому диску.                 |
| `file:<тека>/`                              | Кожен файл у теці на вашому диску.    |
| `https://…`                                 | Будь-яке посилання.                   |

**Версія обов'язкова.** Написати «найновіша» не можна: тоді файл збирав би
інший пак іншого дня. Щоб оновити мод, змініть його версію.

**Modrinth.** Проєкт задається своїм слагом, останньою частиною адреси його
сторінки. Версія є номером версії, показаним на сайті, або id версії.

Багато проєктів дають один номер кільком файлам, по одному на завантажувач:
JEI `19.51.0.418` це версія для Fabric, для Forge і для NeoForge. `#fabric`
каже, яку з них ви маєте на увазі. Завантажувач пишеться так, як його пише
Modrinth: `fabric`, `neoforge`, `forge`, `quilt`, `paper`.

Завантажувач є фільтром. Із `#fabric` версія, яка не для Fabric, зупиняє
збірку навіть тоді, коли її номер унікальний, і це ловить помилкову вставку.
Якщо номер усе ще спільний, збірка перелічує версії з їхніми id, і ви пишете
id замість номера:

```
Modrinth project "jade" has more than one version "15.10.6+fabric"; name one by its id:
  adpNvTZS (fabric, quilt; 1.21.1)
  A416FkrB (fabric, quilt; 1.21.1)
```

**CurseForge.** Файл не має версії, лише номер: останню частину адреси
сторінки файлу. Назва проєкту перед ним перевіряється, і файл, що належить
іншому проєкту, зупиняє збірку. CurseForge потребує ключа API, який
передається як `curseforgeToken`.

**Файли з диска.** Шлях рахується від файлу TOML. Файл подорожує всередині
бандла, тож його не треба ніде розміщувати.

Тека пишеться з кінцевим `/` і потрапляє в теку, названу її назвою, зі
збереженням підтек. Із `shared = "file:config/common/"` у `[common.config]`
файл `config/common/jei/a.ini` встановлюється як `config/shared/jei/a.ini`.
Щоб покласти вміст теки просто в теку призначення, використайте назву
`"."`. Без скісної риски тека відхиляється, тож її не можна взяти
випадково.

### Більше, ніж джерело

Таблиця замість рядка містить те, чого рядок вмістити не може.

```toml
[client.mods]
journeymap = { source = "curseforge:journeymap@8923666", metadata = { optional = true } }
emi        = { github = { repo = "emilyploszaj/emi", tag = "1.1.24+1.21.1", asset = "emi-1.1.24+1.21.1+fabric.jar" } }
modmenu    = { github = { repo = "TerraformersMC/ModMenu", tag = "v20.0.3" } }
tool       = { gitlab = { project = "group/tool", package = "tool", version = "1.4.0", asset = "tool.jar" } }
```

| Поле       | Що містить                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------ |
| `source`   | Будь-який із рядків вище.                                                                  |
| `github`   | Файл релізу: `repo`, `tag` і `asset`. `asset` можна не писати, коли реліз має один файл.   |
| `gitlab`   | Файл пакета: `project`, `package`, `version`, `asset`, а також `host` для власного GitLab. |
| `metadata` | Що завгодно. Воно копіюється в запис файлу в маніфесті, і opys нічого з нього не читає.    |

Запис має рівно одне з `source`, `github` і `gitlab`. Будь-яке інше поле
ігнорується, тож ваш інструмент може тримати там власні нотатки. Це також
означає, що `metadata` з одруківкою зникає без жодного слова.

### Теки

П'ять тек вбудовано, кожна лежить у теці гри під власною назвою: `mods`,
`resourcepacks`, `shaderpacks`, `plugins`, `datapacks`.

Будь-яку іншу назвіть у `[dirs]` і вкажіть, де вона. Після цього вона стає
таблицею, як і решта.

```toml
[dirs]
kubejs   = "${game_directory}/kubejs"
branding = "${root}/launcher/branding"

[common.kubejs]
scripts = "file:kubejs/"

[client.branding]
logo = "file:art/company-logo-final.png"
```

- Шлях починається зі змінної. `${game_directory}` це місце, де шукає гра;
  `${root}` це вся інсталяція, для того, що лежить поза текою гри.
- На сервері `${game_directory}` означає `${root}`, бо сервер має одну теку
  для обох. Тому один файл обслуговує і клієнт, і сервер.
- Вбудовану теку можна перенести так само: `mods = "${root}/shared-mods"`.

Таблиця для теки, якої немає ні серед вбудованих, ні в `[dirs]`, зупиняє
збірку, тож одруківка не стає новою текою.

## Без файлу

`resources()` приймає таблиці, а не шлях. `readResources()` це один зі
способів їх отримати. Їх також можна написати просто в конфігу, у тій самій
формі:

```js
const pack = resources({
  dirs: { kubejs: '${game_directory}/kubejs' },
  common: { mods: { lithium: 'modrinth:lithium@mc1.21.1-0.15.4-fabric' } },
  client: { mods: { sodium: 'modrinth:sodium@mc1.21.1-0.8.13-fabric' } },
});
```

Або прочитати, а потім змінити:

```js
const file = readResources('resources.toml');
const pack = resources({
  ...file,
  client: {
    ...file.client,
    mods: { ...file.client.mods, debug: 'file:dev/debug.jar' },
  },
});
```

Шлях `file:` рахується від файлу TOML, коли таблиці прочитано з нього, і від
конфігу, коли їх написано в ньому.

## Читання файлу

`readResources('resources.toml')` бере шлях від теки, у якій ви запускаєте
`opys`. Якщо ви запускаєте його з іншого місця, дайте URL, який від цього
не залежить:

```js
readResources(new URL('resources.toml', import.meta.url));
```

## Параметри

Другий аргумент містить ключі для сайтів, які їх потребують.

```js
resources(readResources('resources.toml'), {
  curseforgeToken: process.env.CURSEFORGE_TOKEN,
});
```

| Параметр          | Що робить                                                              |
| ----------------- | ---------------------------------------------------------------------- |
| `curseforgeToken` | Ваш ключ API CurseForge. Потрібен для будь-якого запису `curseforge:`. |
| `githubToken`     | Для GitHub: вищий ліміт запитів і приватні репозиторії.                |
| `gitlabToken`     | Для приватних проєктів GitLab.                                         |

## З коду

```js
import { readResources, resolveResources } from '@opys/minecraft-resources';

// Одна сторона, розв'язана: куди йде кожен файл, де він лежить, розмір і хеш.
const files = await resolveResources(readResources('resources.toml'), 'client');
```

## Також

- Записи Modrinth однієї сторони це по запиту на кожен, кілька одночасно.
  Пак зі ста модів розв'язується за кілька секунд.
- Залежності самого мода не підтягуються. Перелічіть кожну.
- Запис `file:` бере файл або цілу теку. Щоб обирати файли за правилом,
  використовуйте плагін `files`.

## Документація

- [Повна сторінка](https://harmoniya-net.github.io/opys/uk/plugins/resources): кожен параметр і чому воно працює саме так
- [Формат](https://harmoniya-net.github.io/opys/uk/format/): з чого складається маніфест
