# Встановлення і запуск

Ця сторінка для лаунчера, який ви пишете поверх `@opys/runtime`: застосунку Electron, застосунку Tauri з процесом Node позаду або звичайного скрипта Node. Вона описує встановлення маніфеста, запуск гри й усі параметри, які приймають функції.

Рантайм нічого не збирає. Він бере готовий маніфест, завантажує й перевіряє все, що там перелічено, і запускає гру, яку маніфест описує. Маніфест надходить із бандла, єдиного файлу, який записує `opys build`, або з пам’яті. Значення, що належать машині запуску, такі як каталог гри й обліковий запис гравця, передаєте ви. Див. [Змінні](/uk/launcher/vars).

## Встановлення пакета {#install-the-package}

```sh
npm install @opys/runtime
```

Потрібен Node.js 20 або новіший. Пакет залежить від `@opys/core`, який використовує лише для типів, і від власного нативного біндинга `@opys/runtime-binding`. npm встановлює обидва. Під час роботи не завантажується нічого з `@opys/dev`, `@opys/minecraft` чи пакета завантажувача. Встановлюйте `@opys/core` окремо, лише якщо вам потрібні його типи `Manifest` і `Blobs` у TypeScript.

## Джерела маніфеста {#manifest-sources}

`install`, `prepare`, `buildLaunch` і `launch` приймають **source** першим аргументом. Це одна з трьох форм, які розрізняють за наявним полем.

| Shape                 | Field                | Meaning                                                                                                  |
| --------------------- | -------------------- | -------------------------------------------------------------------------------------------------------- |
| `{ bundle }`          | `bundle: string`     | Бандл на диску. Відносний шлях відраховують від робочого каталога лаунчера, тому передавайте абсолютний. |
| `{ url }`             | `url: string`        | URL бандла в `http` або `https`, який спочатку завантажують цілком.                                      |
| `{ manifest, blobs }` | `manifest: Manifest` | Об’єкт маніфеста в пам’яті.                                                                              |
|                       | `blobs?: Blobs`      | Де зберігається кожен блоб, названий у маніфесті. Якщо поле пропущено, вважають порожнім.                |

### Бандл на диску {#a-bundle-on-disk}

```js
const source = { bundle: '/home/player/packs/my-pack.opys' };
```

Бандл це zip файл. `buildLaunch`, а також `prepare` або `launch` з `install: false`, читають лише його заголовок. Під час встановлення читають також список артефактів.

### Бандл за URL {#a-bundle-at-a-url}

```js
const source = { url: 'https://example.com/packs/my-pack.opys' };
```

Весь бандл завантажують у тимчасовий файл перед початком встановлення. Коли встановлення завершується, файл видаляють. Поки бандл завантажується, події прогресу не надсилають. `buildLaunch` теж завантажує весь бандл, і лише в бандла на диску читають сам заголовок.

Запит, який не може з’єднатися, перевищив час очікування або отримав статус 408, 425, 429, 500, 502, 503 чи 504, повторюють, загалом до чотирьох спроб, з короткими паузами, які зростають. Будь-який інший статус, наприклад 404, і передача, що обірвалася на півдорозі, завершуються одразу помилкою `NetworkError`. Працюють лише URL в `http` і `https`.

### Маніфест у пам’яті {#a-manifest-in-memory}

```js
const source = {
  manifest: { vars, artifacts, launch },
  blobs: { [id]: { bytes: base64 } },
};
```

`manifest` це JavaScript форма маніфеста, тип `Manifest` з `@opys/core`: `vars` і `artifacts`, а також необов’язкові `launch` і `restrict`. Поле `source` артефакта має вигляд `{ url }` або `{ blob: id }`, де `id` це sha256 байтів у шістнадцятковому записі малими літерами.

Кожен елемент `blobs` має одну з форм:

| Shape            | Meaning                                                |
| ---------------- | ------------------------------------------------------ |
| `{ file: path }` | Файл на цій машині, який читають під час встановлення. |
| `{ bytes: b64 }` | Байти у кодуванні base64.                              |

Кожен id блоба, названий у маніфесті, має бути ключем `blobs`. Відсутній id відхиляють до будь-якого завантаження, з кодом `manifest`. Цей скрипт працює як написано:

```js
import { createHash } from 'node:crypto';
import { install } from '@opys/runtime';

const bytes = Buffer.from('hello from a blob\n');
const id = createHash('sha256').update(bytes).digest('hex');

await install({
  manifest: {
    vars: { root: '/home/player/my-pack' },
    artifacts: [{ path: '${root}/hello.txt', source: { blob: id } }],
  },
  blobs: { [id]: { bytes: bytes.toString('base64') } },
});
```

Форму в пам’яті використовуйте для маніфеста, який щойно зібрали й ніколи не записували в бандл. Лаунчер, який отримує опублікований модпак, використовує `{ bundle }` або `{ url }`.

## Встановлення {#install}

`install(source, options?)` завантажує артефакти, яких ще немає на диску, перевіряє їх, розпаковує архіви, а потім видаляє файли, що відповідають шаблонам `restrict` з маніфеста, але яких маніфест не перелічує, разом із порожніми каталогами під ними. Завершується, коли все це зроблено.

```js
import { install } from '@opys/runtime';

await install(
  { bundle: '/home/player/packs/my-pack.opys' },
  {
    vars: { root: '/home/player/.local/share/my-pack' },
  },
);
```

Файл, що вже є на диску, гешують і завантажують знову, лише якщо геш не збігається. Артефакт без гешу залишають як є. Архіви розпаковують під час кожного встановлення, зокрема й ті, які цього разу не завантажували. Файл, що не пройшов перевірку після завантаження, кидає `IntegrityError`.

Завантаження повторюють чотири рази, з очікуванням 0.5 с, 2 с і 8 с між спробами, перш ніж воно завершиться помилкою `NetworkError`. Блоб, скопійований із бандла, не повторюють.

## Запуск {#launch}

`launch(source, options?)` виконує встановлення, а потім запускає гру. Завершується об’єктом Node `ChildProcess`, причому дитина успадковує стандартні потоки цього процесу.

```js
import { launch } from '@opys/runtime';

const child = await launch(
  { bundle },
  {
    vars: { root, username, uuid, token },
  },
);
child.on('exit', (code) => console.log('exited with', code));
```

`prepare(source, options?)` виконує встановлення і завершується значенням `LaunchSpec` замість запуску гри. `buildLaunch(source, options?)` завершується тим самим `LaunchSpec` і нічого не встановлює. `spawnLaunch(spec)` запускає специфікацію з успадкованими стандартними потоками.

```ts
type LaunchSpec = {
  command: string;
  args: string[];
  workdir: string;
  envs: Record<string, string>;
};
```

Щоб вибрати потоки самостійно, запустіть процес зі специфікації:

```js
import { spawn } from 'node:child_process';

const child = spawn(spec.command, spec.args, {
  cwd: spec.workdir,
  env: { ...process.env, ...spec.envs },
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

Робочий каталог це `launch.workdir` з маніфеста після підставлення змінних, якщо параметр `cwd` його не перевизначає. Відносний каталог відраховують від власного робочого каталога лаунчера, а маніфест, автор якого пропустив `workdir`, має `.`. Якщо `workdir` з маніфеста вам не підходить, передайте `cwd`. Він теж приймає змінні, наприклад `cwd: '${game_directory}'`.

## Параметри {#options}

Кожен параметр необов’язковий.

### `install` {#install-1}

| Option            | Type                           | Default   | Meaning                                                                                                             |
| ----------------- | ------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------- |
| `platform`        | `OsOptions`                    | this host | ОС і процесор, з якими зіставляють правила.                                                                         |
| `vars`            | `Record<string, string>`       | `{}`      | Значення для `${name}`. Вони перевизначають однойменні змінні маніфеста.                                            |
| `features`        | `string[]`                     | `[]`      | Імена ознак, які правила можуть вимагати або забороняти.                                                            |
| `concurrency`     | `number`                       | `8`       | Бюджет завантаження. Див. нижче.                                                                                    |
| `verifyIntegrity` | `boolean`                      | `true`    | `false` пропускає перевірку після завантаження. Файли, що вже є, все одно гешують, бо це вирішує, що завантажувати. |
| `onProgress`      | `(p: InstallProgress) => void` | none      | Викликається в міру просування кожної фази. Див. [Прогрес](/uk/launcher/progress).                                  |

### `launch`, `prepare` і `buildLaunch` {#launch-prepare-and-buildlaunch}

| Option     | Type                      | Default          | Meaning                                                                                                                            |
| ---------- | ------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `platform` | `OsOptions`               | this host        | Як для `install`.                                                                                                                  |
| `vars`     | `Record<string, string>`  | `{}`             | Як для `install`. Також застосовується до команди, аргументів і середовища.                                                        |
| `features` | `string[]`                | `[]`             | Як для `install`.                                                                                                                  |
| `cwd`      | `string`                  | `launch.workdir` | Перевизначає робочий каталог. Змінні до нього застосовуються.                                                                      |
| `install`  | `InstallOptions \| false` | `{}`             | Параметри для встановлення. `false` пропускає його, тому `launch` лише запускає гру, а `prepare` робить те саме, що `buildLaunch`. |

`prepare` і `launch` використовують верхньорівневі `platform`, `features` і `vars` також для встановлення. Об’єкт `install` дає лише `concurrency`, `verifyIntegrity` і `onProgress`. Значення `platform`, `vars` або `features` всередині нього ігнорують. `buildLaunch` приймає ті самі параметри, що й `launch`, без `install`.

`concurrency` це бюджет, а не кількість з’єднань. Кожне завантаження або копіювання блоба забирає з нього частку за розміром, заявленим у маніфесті: 1 для файла меншого за 1 МіБ або невідомого розміру, 2 для файла меншого за 10 МіБ, 4 для файла меншого за 50 МіБ і 8 для більшого. За типового значення 8 вісім малих файлів працюють разом, а файл від 50 МіБ працює сам. Більші файли починаються першими.

### `currentPlatform()` {#currentplatform}

Повертає `OsOptions` цієї машини:

```js
currentPlatform();
// { name: 'linux', version: '', arch: 'x86_64' }
```

`name` це `linux`, `windows` або `osx`. `arch` це `x86_64` або `aarch64`, а `version` порожнє. Передайте інше значення як `platform`, щоб підготуватися до іншої машини.

## Кроки встановлення завантажувача {#loader-install-steps}

Деяким завантажувачам потрібна робота, яку може виконати лише машина запуску. Forge і NeoForge запускають процесори, які збирають патчений клієнтський jar. Маніфест називає цю роботу властивостями `-Dhorno.*`, а виконує її horno. horno працює як частина власного командного рядка гри, дорогою в гру, тому запуск команди з маніфеста це весь крок. Роботу виконують один раз: поруч з інсталятором залишається квитанція, і пізніші запуски бачать квитанцію та переходять одразу до гри.

Щоб виконати крок до старту гри, запустіть запуск один раз із `-Dhorno.installOnly=true` перед його аргументами. Саме так робить `opys install`, коли аргументи маніфеста називають `-Dhorno.`. Спочатку встановіть джерело, бо `buildLaunch` нічого не встановлює:

```js
import { install, buildLaunch, spawnLaunch } from '@opys/runtime';

await install(source, { vars, features });
const spec = await buildLaunch(source, { vars, features });
const child = spawnLaunch({
  ...spec,
  args: ['-Dhorno.installOnly=true', ...spec.args],
});
await new Promise((done, fail) => {
  child.on('exit', (code) =>
    code === 0 ? done() : fail(new Error(`exit ${code}`)),
  );
});
```

## Скасування {#cancellation}

Скасування з JavaScript не підтримується. Rust крейт під рантаймом може скасувати встановлення і повідомляє про помилку `cancelled`, але `install`, `launch` і `prepare` не приймають сигналу й не передають токена. Встановлення працює до кінця або до помилки. Завершення процесу лаунчера це єдиний спосіб його зупинити.

## Помилки {#errors}

Помилка, яку називає рантайм, це `RuntimeError` з полем `code`. Розгалужуйтеся за кодом, а не за повідомленням.

| Class             | `code`       | When                                                                   |
| ----------------- | ------------ | ---------------------------------------------------------------------- |
| `NetworkError`    | `network`    | Завантаження відхилено. Має `url`, `status`, `body`.                   |
| `IntegrityError`  | `integrity`  | Файл не той, який фіксує маніфест. Має `paths`.                        |
| `ExtractionError` | `extraction` | Архів не вдалося розпакувати. Має `artifactPath`.                      |
| `RuntimeError`    | `manifest`   | Маніфест або його бандл не вдалося прочитати, або бракує блоба.        |
| `RuntimeError`    | `io`         | Файлова система щось відхилила, наприклад шлях до бандла, якого немає. |
| `RuntimeError`    | `other`      | Усе інше, наприклад циклічне посилання у змінній.                      |

Джерело неправильної форми, наприклад `{ bundle, url }`, відхиляють до старту рантайма як звичайний `Error`, а не `RuntimeError`. Див. повний перелік у розділі [Помилки](/uk/launcher/errors).

```js
import { install, RuntimeError, NetworkError } from '@opys/runtime';

try {
  await install({ url });
} catch (err) {
  if (err instanceof NetworkError) retryLater();
  else if (err instanceof RuntimeError) showError(err.code, err.message);
  else throw err;
}
```

## Повний лаунчер {#a-complete-launcher}

Цей скрипт приймає шлях до бандла, встановлює його і запускає гру. Він друкує прогрес завантаження і код завершення. Значення це заглушки: `root` це каталог, у якому ваш лаунчер тримає гру, а значення акаунта надходять із вашого власного входу.

```js
// launcher.mjs
import { resolve } from 'node:path';
import { launch, RuntimeError } from '@opys/runtime';

const [bundle] = process.argv.slice(2);
if (!bundle) {
  console.error('usage: node launcher.mjs <bundle.opys>');
  process.exit(2);
}

const vars = {
  root: '/home/player/.local/share/my-pack',
  username: 'Player',
  uuid: '00000000-0000-0000-0000-000000000001',
  token: '0',
};

try {
  const child = await launch(
    { bundle: resolve(bundle) },
    {
      vars,
      install: {
        onProgress(p) {
          if (p.phase === 'download') {
            process.stderr.write(`\r${p.fetched}/${p.total} files`);
          }
        },
      },
    },
  );
  child.on('exit', (code) => {
    console.log(`\nthe game exited with code ${code}`);
  });
} catch (err) {
  if (err instanceof RuntimeError) {
    console.error(`${err.code}: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
```

Запустіть його як `node launcher.mjs my-pack.opys`. Токен `0` запускає гру без акаунта Microsoft, як описано в розділі [Перші кроки](/uk/guide/getting-started).
