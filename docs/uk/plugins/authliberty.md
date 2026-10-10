# Власний сервер авторизації

Плагін `authliberty` з `@opys/minecraft`.

Спрямовує гру на ваш власний сервер облікових записів.

```js
authliberty({
  version: 'latest',
  hosts: {
    auth: 'https://auth.example.com/authserver',
    session: 'https://auth.example.com/sessionserver',
  },
});
```

Гра зазвичай питає Mojang про облікові записи.
[AuthLiberty](https://gitlab.com/harmoniya/authliberty) це невеликий
агент Java, який перенаправляє ці виклики. Ваш сервер має говорити
Yggdrasil, протоколом облікових записів Mojang.

## Параметри

| Параметр                     | Що робить                                             |
| ---------------------------- | ----------------------------------------------------- |
| `version`                    | Точна версія (`'0.3'`) або `'latest'`.                |
| `hosts`                      | Які сервери перенаправляти і куди.                    |
| `project`, `gitlab`, `token` | Де опубліковано jar агента, якщо не за замовчуванням. |

Ключі `hosts`: `auth`, `account`, `session`, `services`. Той, який
ви пропустили, лишається на серверах Mojang. Це також може бути
функція від ключа.

## Що він додає

| Вид        | Що          |
| ---------- | ----------- |
| Файли      | Jar агента. |
| Запуск     | `jvmArgs`.  |
| Змінні     | Немає.      |
| Середовище | Немає.      |

Кожен пункт нижче: що це таке і як воно потрапляє в
[маніфест](/uk/format/).

### Файли · jar агента

Один jar у теці бібліотек.

<!-- prettier-ignore -->
```js{6-12}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
    authliberty({
      version: 'latest',
      hosts: {
        auth: 'https://auth.example.com/authserver',
        session: 'https://auth.example.com/sessionserver',
      },
    }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: [
      '@authliberty.jvmArgs',
      '@minecraft.jvmArgs',
      '@minecraft.mainClass',
      '@minecraft.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
{
  "path": "${library_directory}/net/harmoniya/authliberty/latest/authliberty-latest.jar",
  "source": { "url": "https://gitlab.com/api/v4/projects/harmoniya%2Fauthliberty/packages/generic/authliberty/latest/authliberty-latest.jar" },
  "size": 601888,
  "integrity": { "sha256": "aca98855bf83000fb48e3854929a83a7d4785785e4580dfa72c5727b0d3bdaaa" }
}
```

### Запуск · `@authliberty.jvmArgs`

Завантажує агента, потім один рядок на кожен заданий вами хост.

<!-- prettier-ignore -->
```js{6-12,17}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
    authliberty({
      version: 'latest',
      hosts: {
        auth: 'https://auth.example.com/authserver',
        session: 'https://auth.example.com/sessionserver',
      },
    }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: [
      '@authliberty.jvmArgs',
      '@minecraft.jvmArgs',
      '@minecraft.mainClass',
      '@minecraft.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// у маніфесті
"args": [
  "-javaagent:${library_directory}/net/harmoniya/authliberty/latest/authliberty-latest.jar",
  "-Dminecraft.api.auth.host=https://auth.example.com/authserver",
  "-Dminecraft.api.session.host=https://auth.example.com/sessionserver"
  // … далі власні аргументи JVM гри
]
```

**Чому ви розміщуєте його самі і першим:** агент має
завантажитися раніше, ніж запуститься будь-який код облікових
записів. Лише рядок запуску визначає порядок, а рядок запуску
ваш.

Немає змінних.

## Варто знати

- Він вирішує, _куди_ гра звертається. Він не вирішує, _хто_
  такий гравець. Це токен: див. [`bifrost`](./bifrost).
- `'latest'` закріплюється за jar, який є найновішим на момент
  збирання.
