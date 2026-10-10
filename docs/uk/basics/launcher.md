# Інтеграція з лаунчером

`@opys/runtime` це частина opys, потрібна вашим гравцям. Дайте їй бандл,
і вона встановить гру та запустить її.

Вона працює скрізь, де працює Node.js 20 і новіший: Electron, Node бік
застосунку Tauri, скрипт.

```sh
npm install @opys/runtime
```

## Усе цілком

```js
import { launch } from '@opys/runtime';

const child = await launch(
  { url: 'https://example.com/packs/game.opys' },
  {
    vars: {
      root: '/home/player/.local/share/my-pack',
      username: 'Player',
      uuid: '00000000-0000-0000-0000-000000000001',
      token: '0',
    },
  },
);

child.on('exit', (code) => console.log('game exited with', code));
```

Це завантажує бандл, встановлює або оновлює гру і запускає її. Ви
отримуєте звичайний Node `ChildProcess`.

**Два аргументи, два власники.** Бандл це те, що вирішив автор збірки.
`vars` це те, що знає лише цей комп'ютер. Завжди передавайте `root` як
абсолютний шлях. Усі імена: [Змінні](/uk/plugins/minecraft#змінні).

**Чому окремий пакет:** рантайм нічого не знає про Forge чи Modrinth.
Все це було вирішено, коли бандл зібрали, тож ваш лаунчер везе щось
мале.

## Звідки береться бандл

| Джерело        | Коли використовувати                                 |
| -------------- | ---------------------------------------------------- |
| `{ url }`      | Збірка на сервері. Найпростіше.                      |
| `{ bundle }`   | Ви завантажили його самі. Передайте абсолютний шлях. |
| `{ manifest }` | Маніфест у пам'яті, без перевезених файлів.          |

`{ url }` завантажує бандл при кожному виклику. Щоб уникнути цього,
забирайте його, коли він змінюється, і передавайте `{ bundle }`.

## Показ прогресу

```js
await launch(source, {
  vars,
  install: {
    onProgress(p) {
      if (p.phase === 'download') {
        bar.set(p.totalBytes ? p.bytes / p.totalBytes : p.fetched / p.total);
      }
    },
  },
});
```

Встановлення йде фазами, по порядку. `p.phase` каже, яка саме:

| `phase`          | Значення                     | Додаткові поля                            |
| ---------------- | ---------------------------- | ----------------------------------------- |
| `resolve`        | Початок.                     |                                           |
| `download`       | Загальне місце завантаження. | `fetched`, `total`, `bytes`, `totalBytes` |
| `download:start` | Один файл почався.           | `path`, `totalBytes`                      |
| `download:bytes` | Один файл просунувся.        | `path`, `bytes`                           |
| `download:done`  | Один файл завершився.        | `path`                                    |
| `verify`         | Перевірка хешів.             |                                           |
| `extract`        | Розпакування архівів.        | `count`                                   |
| `cleanup`        | Старі файли видалені.        | `removed`, `directories`                  |

Файли, що вже на диску з правильним хешем, пропускаються. Тож друге
встановлення швидке, а перерване продовжує з місця зупинки.

## Обробка помилок

```js
import { install, NetworkError, RuntimeError } from '@opys/runtime';

try {
  await install(source, { vars });
} catch (err) {
  if (err instanceof NetworkError) showRetry(err.url, err.status);
  else if (err instanceof RuntimeError) showError(err.code, err.message);
  else throw err;
}
```

Кожна невдача має `code`. Вирішуйте за кодом, ніколи за текстом
повідомлення.

| `code`       | Значення                                 | Що робити                                   |
| ------------ | ---------------------------------------- | ------------------------------------------- |
| `network`    | Завантаження не вдалося, після повторів. | Запропонуйте повторити.                     |
| `integrity`  | Файл не збігається зі своїм хешем.       | Повідомте про це. Збірку треба перезібрати. |
| `extraction` | Не вдалося розпакувати архів.            | Перевірте місце на диску та дозволи.        |
| `manifest`   | Бандл не читається або небезпечний.      | Повідомте про це автора збірки.             |
| `io`         | Файлова система щось відхилила.          | Покажіть повідомлення.                      |
| `other`      | Усе інше.                                | Покажіть повідомлення.                      |

Встановлення поки не можна скасувати з JavaScript.

## Самостійне виконання кроків

`launch` це короткий шлях. Частини поруч, коли вам потрібен контроль:

| Функція                  | Що робить                                        |
| ------------------------ | ------------------------------------------------ |
| `install(source, o)`     | Встановлює. Нічого не запускає.                  |
| `prepare(source, o)`     | Встановлює і повертає те, що запустити.          |
| `buildLaunch(source, o)` | Повертає те, що запустити. Нічого не встановлює. |
| `spawnLaunch(spec)`      | Запускає його.                                   |

«Що запустити» це `{ command, args, workdir, envs }`.

**Випадок: забрати журнал гри.** `launch` віддає грі ваш термінал. Щоб
читати її вивід натомість, запустіть її самі:

```js
import { spawn } from 'node:child_process';
import { prepare } from '@opys/runtime';

const spec = await prepare(source, { vars });
const child = spawn(spec.command, spec.args, {
  cwd: spec.workdir,
  env: { ...process.env, ...spec.envs },
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

**Випадок: швидкий перший запуск із Forge.** Forge і NeoForge
завершують встановлення під час першого запуску, що робить його
повільним. Щоб зробити це за власним екраном прогресу, запустіть раз з
одним зайвим аргументом. Гра не стартує:

```js
import { install, buildLaunch, spawnLaunch } from '@opys/runtime';

await install(source, { vars });
const spec = await buildLaunch(source, { vars });

if (spec.args.some((arg) => arg.startsWith('-Dhorno.'))) {
  const child = spawnLaunch({
    ...spec,
    args: ['-Dhorno.installOnly=true', ...spec.args],
  });
  await new Promise((done) => child.on('exit', done));
}
```

## Параметри

| Параметр          | Де                  | Що означає                                                       |
| ----------------- | ------------------- | ---------------------------------------------------------------- |
| `vars`            | скрізь              | Значення для змінних бандла.                                     |
| `features`        | скрізь              | Перемикачі, наприклад `java_console`.                            |
| `platform`        | скрізь              | Встановити для іншої ОС чи ЦП. Типово: цієї.                     |
| `cwd`             | `launch`, `prepare` | Перевизначає робочу теку.                                        |
| `install`         | `launch`, `prepare` | Параметри встановлення або `false`, щоб пропустити встановлення. |
| `onProgress`      | `install`           | Зворотний виклик прогресу.                                       |
| `concurrency`     | `install`           | Паралельні завантаження. Типово 8.                               |
| `verifyIntegrity` | `install`           | `false` пропускає перевірки хешів. Лишіть увімкненим.            |
