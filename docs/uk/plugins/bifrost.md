# Bifrost

Функція `resolveBifrost` з `@opys/minecraft`.

Створює токен входу гравця під час запуску.

<!-- prettier-ignore -->
```js{15-24}
// opys.config.mjs
import { defineConfig, userDataDir } from '@opys/dev';
import { java, minecraft, resolveBifrost } from '@opys/minecraft';

export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
  },
  run: (manifest) => ({
    vars: {
      ...manifest.vars,
      root: userDataDir('my-pack'),
      ...resolveBifrost({
        privateKey: process.env.BIFROST_PRIVATE_KEY,
        username: 'Player',
        uuid: '00000000-0000-0000-0000-000000000001',
      }),
    },
  }),
});
```

`resolveBifrost` підписує токен, який приймає сервер
[Bifrost](https://gitlab.com/harmoniya/bifrost), закритим ключем,
який ви тримаєте.

## Це не плагін

Він не йде в `plugins` і не додає **нічого** до бандла.

**Чому:** токен належить одному гравцеві і має строк дії. Бандл
один для всіх і діє довго. Тому токен створюється в
[`run`](/uk/basics/config#run) на комп'ютері гравця при кожному
запуску.

## Параметри

| Параметр     | Що це                                            |
| ------------ | ------------------------------------------------ |
| `privateKey` | Закритий ключ Ed25519 у вигляді PKCS#8 PEM.      |
| `username`   | Ім'я гравця.                                     |
| `uuid`       | ID гравця.                                       |
| `expiresIn`  | Час дії в секундах. За замовчуванням: 24 години. |

## Що він повертає

`{ username, uuid, token }`: саме ті три змінні, які
[`minecraft`](./minecraft#змінні) лишає відкритими. Додайте їх у
`vars` через spread.

## Варто знати

::: warning Тримайте ключ поза `manifest`
Усе під `manifest` копіюється в бандл, а бандл це архів zip,
який кожен може відкрити. Читайте ключ із середовища всередині
`run`.
:::

- Ключ може бути одним рядком, з `\n` замість розривів рядків.
  Зручно для змінної середовища.
- Поєднуйте його з [`authliberty`](./authliberty), який спрямовує
  гру на ваш сервер.
