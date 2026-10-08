# Документи версій

Ця сторінка розповідає про документи версій, які opys читає для Forge, NeoForge, Cleanroom і lwjgl3ify: що публікується, який вигляд має документ, як він називає [horno](/uk/internals/horno) та інсталятор завантажувача і як цей набір підтримується в актуальному стані. Читайте її, якщо ви змінюєте плагін завантажувача модів або якщо ви хочете спрямувати плагін на дзеркало. Для автора модпака коротка версія така: плагін вибирає збірку з індексу, забирає один документ і ставиться до нього як до version JSON Mojang. Вам не потрібно читати нічого з цього, якщо ви не хостите власну копію.

## Що публікується {#what-is-published}

Кожен документ згенеровано з власного інсталятора або релізу завантажувача, і всі вони віддаються з GitHub Pages за адресою `https://harmoniya-net.github.io/metadata/`. Вони перегенеровуються щоночі (див. [Перегенерування](#regeneration)). Генератор лежить у [harmoniya-net/metadata](https://github.com/harmoniya-net/metadata).

```
https://harmoniya-net.github.io/metadata/
  index.json                          the four families and where each index is

  forge/
    index.json                        every Minecraft version and its builds
    versions/<mc>/<build>.json        one build's document
    versions/<mc>/latest.json         a copy of the build each alias names
    versions/<mc>/recommended.json
    versions/<mc>/best.json
    skipped.json                      builds that produced nothing, and why

  neoforge/                           the same layout
  cleanroom/                          the same layout
  lwjgl3ify/                          the same layout
```

Кожна родина має один індекс. Він перелічує кожну версію Minecraft, для якої родина має збірки, а під кожною версією її збірки і три псевдоніми: `latest`, `recommended` і `best`. `best` дорівнює `recommended`, коли він є, і `latest` у протилежному разі. Гола версія Minecraft, така як `1.20.1`, визначається у свою збірку `best`. `recommended` дорівнює `null`, коли родині немає чого рекомендувати, наприклад версії NeoForge лише з пререлізами.

GitHub Pages віддає файли, а не перенаправлення, тож псевдонім теж є файлом: кожен файл псевдоніма у `versions/<mc>/` є копією документа, який він називає.

Кореневий `index.json` перелічує чотири родини і місце кожного індексу. Він не має власних збірок.

## Індекс {#the-index}

`index.json` родини має ключ `versions` і ключ `generated` (мітку часу ISO). Індекси Forge і NeoForge також мають ключ `horno` з тегом релізу і головним класом, які називають їхні документи. Індекси Cleanroom і lwjgl3ify його не мають, бо їхні документи не називають horno. Кожен запис у `versions` виглядає так:

```json
{
  "latest": "1.20.1-47.4.26",
  "latestUrl": "https://harmoniya-net.github.io/metadata/forge/versions/1.20.1/1.20.1-47.4.26.json",
  "recommended": "1.20.1-47.4.10",
  "recommendedUrl": "https://harmoniya-net.github.io/metadata/forge/versions/1.20.1/1.20.1-47.4.10.json",
  "best": "1.20.1-47.4.10",
  "bestUrl": "https://harmoniya-net.github.io/metadata/forge/versions/1.20.1/1.20.1-47.4.10.json",
  "builds": [
    {
      "build": "1.20.1-47.4.25",
      "url": "https://harmoniya-net.github.io/metadata/forge/versions/1.20.1/1.20.1-47.4.25.json"
    },
    {
      "build": "1.20.1-47.4.26",
      "url": "https://harmoniya-net.github.io/metadata/forge/versions/1.20.1/1.20.1-47.4.26.json"
    }
  ]
}
```

`builds` тут скорочено до двох записів; справжній перелічує кожну збірку, від найстарішої.

Поля `url` абсолютні. Читач ніколи не будує адресу документа з власної адреси індексу; він іде за URL, який йому дали.

Як кожна родина визначає `latest` і `recommended`:

- **Forge** бере свої промоції з власного ендпоїнта Forge. Тег промоції Forge є його власною версією, а не id збірки, тож генератор зіставляє за витягнутою версією. `1.7.10` повторює версію Minecraft у своєму id збірки, і саме тому.
- **NeoForge** не публікує промоцій. `latest` є найновішою збіркою. `recommended` є найновішою збіркою, чия версія не має кваліфікатора.
- **Cleanroom** і **lwjgl3ify** читають прапорець пререлізу GitHub у кожному релізі. `latest` є найновішим релізом, а `recommended` є найновішим із тих, що не позначені як пререліз.

Кожна родина також публікує `skipped.json`: кожну збірку, яку не вдалося перетворити на документ, із причиною. Збірки, переліченої там, немає в індексі.

## Документ {#a-document}

Кожен документ є звичайним version JSON Mojang, але родини не всі одного виду. Існує дві форми.

### Forge і NeoForge: патч {#forge-and-neoforge-a-patch}

Документ Forge або NeoForge є патчем. Він має `inheritsFrom`, і лаунчер або накладання opys зливає його з ванільною версією тієї самої версії Minecraft. Так виглядає збірка для 1.13 або новішої версії, `forge/versions/1.20.1/1.20.1-47.4.10.json`, скорочена до незвичайних частин. Старіші збірки називають менше про horno або нічого; див. [Як документ називає horno](#how-a-document-names-horno).

```json
{
  "id": "1.20.1-forge-47.4.10",
  "inheritsFrom": "1.20.1",
  "mainClass": "net.harmoniya.horno.Main",
  "arguments": {
    "jvm": [
      "-Dhorno.librariesDir=${library_directory}",
      "-Dhorno.installer=${library_directory}/net/minecraftforge/forge/1.20.1-47.4.10/forge-1.20.1-47.4.10-installer.jar",
      "-Dhorno.installerUrl=https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1-47.4.10/forge-1.20.1-47.4.10-installer.jar",
      "-Dhorno.installerSha1=66bfea9963bfa60d88bab6b2750e74a958392715",
      "-Dhorno.minecraft=${library_directory}/com/mojang/minecraft/1.20.1/minecraft-1.20.1-client.jar"
    ]
  },
  "libraries": [
    {
      "name": "net.minecraftforge:fmlloader:1.20.1-47.4.10",
      "downloads": {
        "artifact": { "path": "…", "url": "…", "sha1": "…", "size": 267079 }
      }
    },
    {
      "name": "com.mojang:minecraft:1.20.1:client",
      "downloads": {
        "artifact": { "path": "…", "url": "…", "sha1": "…", "size": 23028853 }
      }
    },
    {
      "name": "net.harmoniya:horno:0.1.6",
      "downloads": {
        "artifact": {
          "path": "net/harmoniya/horno/0.1.6/horno-0.1.6.jar",
          "url": "https://github.com/harmoniya-net/horno/releases/download/0.1.6/horno-0.1.6.jar",
          "sha1": "96cf5868da7446680a5355638aec22ba4c8dd5c9",
          "size": 103073
        }
      }
    }
  ]
}
```

Документ загалом має близько тридцяти бібліотек. Важливі тут такі:

- **`mainClass`** дорівнює `net.harmoniya.horno.Main`. Лаунчер стартує його як будь-який головний клас. Збірки від 1.6.1 до 1.12.2 є винятком: їхній `mainClass` є власним LaunchWrapper Forge.
- **`horno` як бібліотека.** horno є звичайним елементом у `libraries`, тож лаунчер завантажує його і кладе у classpath. На шляху до 1.13 horno прибирає власний jar з classpath гри перед передачею керування; див. [horno](/uk/internals/horno).
- **Ванільний клієнтський jar як бібліотека.** Документ оголошує `com.mojang:minecraft:<mc>:client`, щоб `${library_directory}` міг на нього посилатися. Лаунчер, який іде за `inheritsFrom`, забирає його вдруге. Генератор приймає цю ціну, щоб не вимагати повідомляти лаунчеру, де лежить jar.
- **Інсталятор не є бібліотекою.** Він названий лише у `-Dhorno.installer`, `-Dhorno.installerUrl` і `-Dhorno.installerSha1`. Він є вхідними даними для horno, а не залежністю часу виконання, і у classpath він конфліктував би з власним jar завантажувача.

### Cleanroom і lwjgl3ify: ціла версія {#cleanroom-and-lwjgl3ify-a-whole-version}

Документи Cleanroom і lwjgl3ify є повними version JSON. Вони не мають `inheritsFrom` і не називають horno. Нічого не треба накладати, і нічого не запускається першим.

- **Cleanroom** розпаковує один jar і ніколи не запускав процесора, тож його документ перелічує той jar як звичайну бібліотеку. Починаючи з 0.5.16-alpha, Cleanroom сам постачає повний документ. Ранніші релізи постачали патчі поверх 1.12.2, і генератор накладає їх на неї. Там і ніде більше застосовується одне правило: ванільний LWJGL 2 видаляється, бо LWJGL 3 публікується під іншою групою, а просте злиття залишило б обидва. Накладання також пропускає ванільні `javaVersion` і `logging`: Cleanroom ніколи не працював на ванільній Java 8 для 1.12.2, а конфігурація логування належить log4j, який Cleanroom замінює.
- **lwjgl3ify** не має інсталятора. Кожен реліз постачає `version.json`, який генератор перевидає зі зробленими встановлюваними бібліотеками: шляхи виведені, відсутні хеші доповнені, а ті, які його maven відкинув, адресовані на власні файли релізу. Документ не може сказати, що lwjgl3ify є також модом, тож його jar і UniMixins не входять у документ. opys додає їх у `mods/` з GitHub Releases. Див. [lwjgl3ify](/uk/plugins/lwjgl3ify).

## Як документ називає horno {#how-a-document-names-horno}

Для збірки Forge або NeoForge, яка має процесорне встановлення, документ називає інсталятор трьома властивостями:

| Властивість                    | Що називає                                           |
| ------------------------------ | ---------------------------------------------------- |
| `-Dhorno.installer=<path>`     | де має лежати інсталятор у `libraries/`              |
| `-Dhorno.installerUrl=<url>`   | звідки його забрати, на власному maven завантажувача |
| `-Dhorno.installerSha1=<sha1>` | який хеш він повинен мати                            |

`-Dhorno.librariesDir` і `-Dhorno.minecraft` названі так само. horno само забирає інсталятор, звіряє його з sha1 і читає його як дані. Що відбувається далі, див. у [horno](/uk/internals/horno).

Збірки до 1.13 називають шлях jar-мода натомість. Документ 1.5.2 називає `-Dhorno.mainClass`, `-Dhorno.minecraft` і `-Dhorno.patched`. Документ 1.4.7 також називає `-Dhorno.jarmod`, `-Dhorno.jarmodUrl` і `-Dhorno.jarmodSha1`, де списки URL і sha1 розділені пробілами. Документ від 1.6.1 до 1.12.2 не називає жодної властивості horno, бо Forge там є твікером LaunchWrapper і списком бібліотек.

Кожен аргумент `-Dhorno.*` є аргументом JVM. Лаунчер передає його далі й не читає. opys робить так само: аргументи є частиною маніфесту, а маніфест є контрактом. Єдине місце, куди opys дивиться, це `opys install`, який перевіряє, чи починається якийсь аргумент із `-Dhorno.`, щоб знати, чи є крок встановлення завантажувача для виконання.

## Використання іншого індексу {#using-a-different-index}

Кожен із цих чотирьох плагінів приймає опцію `source`, яка замінює адресу індексу:

| Плагін                     | Опції                                             | Типовий індекс                                       |
| -------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| `forge(version, opts)`     | `source`, `manifestBase`                          | `https://harmoniya-net.github.io/metadata/forge`     |
| `neoforge(version, opts)`  | `source`, `manifestBase`                          | `https://harmoniya-net.github.io/metadata/neoforge`  |
| `cleanroom(version, opts)` | `source`                                          | `https://harmoniya-net.github.io/metadata/cleanroom` |
| `lwjgl3ify(version, opts)` | `source`, `repo`, `token`, `apiBase`, `unimixins` | `https://harmoniya-net.github.io/metadata/lwjgl3ify` |

Типові значення експортуються як `DEFAULT_FORGE_INDEX`, `DEFAULT_NEOFORGE_INDEX`, `DEFAULT_CLEANROOM_INDEX` і `DEFAULT_LWJGL3IFY_INDEX` з кожного пакета.

```js
forge('1.20.1', { source: 'https://mirror.example.com/metadata/forge' });
```

`manifestBase` у Forge і NeoForge інший. Це адреса, з якої читається маніфест версій Mojang замість власного Mojang, і накладання використовує її, щоб забрати ванільну версію. Він не змінює, звідки беруться індекс і документи Forge. `repo`, `token` і `apiBase` у lwjgl3ify призначені для GitHub, звідки він читає свої релізи і jar модів.

Дзеркало має публікувати власні документи. URL індексу абсолютні, тож самого `source` недостатньо: генератор записує кожен URL відносно `SITE_BASE`, типовим значенням якого є публічна адреса. Запустіть його із `SITE_BASE`, заданим туди, де обслуговуватиметься дзеркало, інакше індекс вказуватиме назад на harmoniya-net.github.io.

## Перегенерування {#regeneration}

Воркфлоу `Version documents` (`pages.yml` у репозиторії метаданих) перегенеровує документи. Він запускає тести, потім кожен генератор, потім копіює `static/` на сайт. Його можна стартувати вручну, інакше він стартує двома шляхами:

- **Щоночі.** Він запускається щодня о 05:17 UTC.
- **На релізі horno.** Документи Forge і NeoForge називають реліз horno за URL і sha1, тож новий реліз робить їх застарілими. Воркфлоу релізу horno запускає воркфлоу метаданих, коли налаштовано токен. Без токена крок друкує команду для ручного запуску: `gh workflow run pages.yml -R harmoniya-net/metadata`.

Воркфлоу читає тег horno з найновішого релізу horno на момент запуску, тож перегенерований набір завжди називає найновіший реліз.

Щоб згенерувати локально, запустіть один генератор з репозиторію `metadata`:

```sh
node src/index.mjs                       # every Forge build
node src/index.mjs --mc 1.7.10           # one Minecraft version
node src/neoforge-index.mjs              # every NeoForge build
node src/cleanroom-index.mjs             # every Cleanroom release
node src/lwjgl3ify-index.mjs             # every lwjgl3ify release
node src/root-index.mjs                  # the site root's index.json
```

Запуск, обмежений через `--mc` або `--only`, не перезаписує `index.json` чи `skipped.json`, бо зріз не знає, які збірки існують. `--only` записує той один документ і також не чіпає файлів псевдонімів, бо одна збірка не свідчить про те, яка найновіша. `--mc` усе одно оновлює файли псевдонімів для своєї версії Minecraft. Лише генератори Forge і NeoForge приймають `--mc`.

| Змінна середовища | Значення                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `HORNO_TAG`       | Реліз horno, який називають документи. Типово `0.1.0`; воркфлоу задає його в найновіший реліз. |
| `HORNO_JAR`       | Локальний jar horno для хешування, для релізу, якого ще не існує.                              |
| `SITE_BASE`       | Адреса, відносно якої абсолютні URL індексу.                                                   |
| `CONCURRENCY`     | Паралельні збірки. Типово 12.                                                                  |
| `GITHUB_TOKEN`    | Необов’язковий. Дозволяє переліку релізів GitHub вийти за анонімний ліміт.                     |

Усе прочитане з мережі кешується у `.cache/`, тож повільним є лише перший запуск.

## Файли, що віддаються як є {#files-served-as-they-are}

Два файли, які потрібні horno для Forge 1.5 і 1.5.1, не генеруються. Вони копіюються з `static/fmllibs/`, бо хост, який їх віддавав, зник, і жоден репозиторій Maven їх не несе. horno звіряє кожен із sha1, який просить збірка. Див. [horno](/uk/internals/horno).
