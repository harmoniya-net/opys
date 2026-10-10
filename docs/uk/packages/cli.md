# @opys/cli

[![npm](https://img.shields.io/npm/v/@opys/cli.svg)](https://www.npmjs.com/package/@opys/cli)

Команда `opys`. Вона збирає конфігурацію в один файл для поширення,
а потім встановлює і запускає або конфігурацію, або зібраний файл.

```sh
npm install -g @opys/cli
```

Потрібен Node.js 20 або новіший. Конфігурація це звичайний файл
JavaScript, тому встановіть у свій проєкт те, що він імпортує:

```sh
npm install -D @opys/dev @opys/minecraft
```

## Приклад

```sh
opys launch                 # зібрати конфігурацію, встановити, запустити гру
opys install                # те саме, без запуску гри
opys build                  # записати бандл, названий в `output` конфігурації
```

Зібраний бандл працює без конфігурації. Значення гравця надходять з
`--var`:

```sh
opys launch game.opys --var root=/path/to/install --var username=Player \
  --var uuid=00000000-0000-0000-0000-000000000001 --var token=0
```

## Команди

| Команда                 | Збирає | Встановлює | Запускає гру |
| ----------------------- | ------ | ---------- | ------------ |
| `opys build`            | так    | ні         | ні           |
| `opys install`          | так    | так        | ні           |
| `opys launch`           | так    | так        | так          |
| `opys install <bundle>` | ні     | так        | ні           |
| `opys launch <bundle>`  | ні     | так        | так          |

- Без названого бандла команда читає `opys.config.mjs` у поточній
  теці.
- `opys install` також виконує власний крок встановлення завантажувача
  модів, який інакше відбувається під час першого запуску.
- З названим бандлом жодна конфігурація не завантажується, тому її `run`
  не відбувається. Передайте те, що він би встановив, через `--var`.

## Параметри

| Параметр            | Команди              | Що робить                                          |
| ------------------- | -------------------- | -------------------------------------------------- |
| `-i`, `--input`     | усі, з конфігурацією | Файл конфігурації. Типово `opys.config.mjs`.       |
| `-o`, `--output`    | `build`              | Бандл для запису. Типово: `output` конфігурації.   |
| `--mode <value>`    | усі, з конфігурацією | Передається функції конфігурації. Типово: команда. |
| `--var <key=value>` | `install`, `launch`  | Встановлює змінну. Повторіть для кількох.          |
| `--feature <a,b>`   | `install`, `launch`  | Вмикає прапорці, через кому.                       |
| `--log-level <l>`   | усі                  | `silent`, `error`, `warn`, `info` або `debug`.     |
| `-v`                | усі                  | Те саме, що `--log-level debug`.                   |

`opys build` без `-o` і без `output` у конфігурації друкує маніфест
як JSON. Це для читання і порівняння. Встановити з цього не можна,
бо вбудованих файлів там немає.

## Коди виходу

| Код | Значення                                                |
| --- | ------------------------------------------------------- |
| 0   | Успіх.                                                  |
| 1   | Помилка в команді чи конфігурації або невдале збирання. |
| 2   | Не вдалося завантаження.                                |
| 3   | Файл не збігся зі своїм хешем.                          |
| 4   | Не вдалося розпакувати архів.                           |
| 5   | Гра стартувала, а потім вийшла з власною помилкою.      |

## Кожна команда

Кожна команда, у кожному способі використання.

```sh
# збирання
opys build                               # записує `output` конфігурації
opys build -o dist/game.opys             # записує сюди замість
opys build -i packs/server.config.mjs    # інша конфігурація
opys build --mode release                # функція конфігурації отримує { mode: 'release' }
opys build > manifest.json               # вихід не названо: маніфест як JSON

# встановлення без запуску гри
opys install
opys install --feature java_console
opys install game.opys --var root=/srv/game

# запуск
opys launch
opys launch --mode dev                   # типово `mode` це 'launch'
opys launch --var username=Tester        # перекриває одну змінну
opys launch --feature java_console,custom_java
opys launch game.opys --var root=/srv/game --var username=Player \
  --var uuid=00000000-0000-0000-0000-000000000001 --var token=0

# скільки говорить
opys launch -v
opys build --log-level silent
```

## Документація

- [Вступ](https://harmoniya-net.github.io/opys/uk/basics/intro): перша збірка
- [Команда opys](https://harmoniya-net.github.io/opys/uk/basics/cli): кожна команда, і чому вона так працює
- [Усунення проблем](https://harmoniya-net.github.io/opys/uk/reference/troubleshooting)

Частина [opys](https://github.com/harmoniya-net/opys).
