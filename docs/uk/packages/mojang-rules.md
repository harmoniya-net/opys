# @opys/mojang-rules

[![npm](https://img.shields.io/npm/v/@opys/mojang-rules.svg)](https://www.npmjs.com/package/@opys/mojang-rules)

Типи формату правил Mojang: об'єкти `{ action, os, features }`, які
кажуть, для якого комп'ютера бібліотека чи аргумент. Типи і два
однорядкові помічники, без залежностей і без нативного коду.

```sh
npm install @opys/mojang-rules
```

## Приклад

```ts
import { satisfiesRuleset } from '@opys/mojang';
import type { MojangRuleset } from '@opys/mojang-rules';

// проходить усюди, крім macOS
const notMac: MojangRuleset = [
  { action: 'allow' },
  { action: 'disallow', os: { name: 'osx' } },
];

satisfiesRuleset(notMac, { name: 'linux', version: '6.12', arch: 'x86_64' }); // true
```

Цей пакет лише називає формат. Обчислення правила це справа
[`@opys/mojang`](https://www.npmjs.com/package/@opys/mojang).

## Формат

```text
MojangRuleset
└── MojangRule[]
    ├── action         RuleAction
    ├── os?            OsConstraint
    └── features?      FeatureConstraint
```

### MojangRuleset

Список правил. Він проходить, коли проходить **кожне** правило в ньому.

<!-- prettier-ignore -->
```jsonc
[]                                            // немає правил: проходить усюди
[{ "action": "allow", "os": { "name": "osx" } }]   // лише macOS
[
  { "action": "allow", "os": { "name": "linux" } },
  { "action": "allow", "os": { "name": "windows" } }
]                                             // не проходить ніде: жоден комп'ютер не обидва водночас
```

### MojangRule

Одна умова. Правило має `os` або `features`, або жодного з них.

| Поле        | Тип                     | Що це                     |
| ----------- | ----------------------- | ------------------------- |
| `action`    | `'allow' \| 'disallow'` | Чи збіг проходить, чи ні. |
| `os?`       | `OsConstraint`          | Комп'ютер, про який воно. |
| `features?` | `FeatureConstraint`     | Прапорці, про які воно.   |

| Правило                               | Проходить, коли          |
| ------------------------------------- | ------------------------ |
| `{ action: 'allow' }`                 | Завжди.                  |
| `{ action: 'allow', os: … }`          | Комп'ютер збігається.    |
| `{ action: 'disallow', os: … }`       | Комп'ютер не збігається. |
| `{ action: 'allow', features: … }`    | Прапорці збігаються.     |
| `{ action: 'disallow', features: … }` | Прапорці не збігаються.  |

### OsConstraint

Який комп'ютер. Кожне поле необов'язкове, і кожне наведене поле має
збігтися.

| Поле       | Тип      | Що це                                                  |
| ---------- | -------- | ------------------------------------------------------ |
| `name?`    | `OsName` | `'linux'`, `'windows'` або `'osx'`.                    |
| `arch?`    | `OsArch` | `'x86'`, `'x86_64'`, `'arm'`, `'aarch64'` або `'any'`. |
| `version?` | `string` | Регулярний вираз за версією ОС.                        |

```jsonc
{ "name": "windows", "arch": "x86_64" }
{ "name": "windows", "version": "^10\\." }
```

### FeatureConstraint

Які прапорці: мапа з назви прапорця на те, чи має він бути увімкненим.

```jsonc
{ "is_demo_user": true }     // збігається, коли прапорець увімкнено
{ "java_console": false }    // збігається, коли його вимкнено
```

### OsOptions

Комп'ютер, для якого обчислюється правило. Не частина правила: це те,
що ви передаєте поруч із ним.

| Поле      | Тип      | Що це                     |
| --------- | -------- | ------------------------- |
| `name`    | `string` | Назва ОС, як `OsName`.    |
| `version` | `string` | Версія ОС.                |
| `arch`    | `string` | Архітектура, як `OsArch`. |

## Функції

| Функція                | Що повертає                              |
| ---------------------- | ---------------------------------------- |
| `emptyRuleset()`       | `[]`, набір правил, що завжди проходить. |
| `allowOsRuleset(name)` | Набір правил, що проходить на одній ОС.  |

```js
emptyRuleset(); // []
allowOsRuleset('osx'); // [{ action: 'allow', os: { name: 'osx' } }]
```

## Короткої форми тут немає

opys також дозволяє писати правило як рядок, `'allow.os.osx'`. Це
написання, а також типи `Rule` і `Ruleset`, які приймають обидва,
це справа [`@opys/core`](https://www.npmjs.com/package/@opys/core).

| Пакет                | Які правила він читає    |
| -------------------- | ------------------------ |
| `@opys/mojang-rules` | Називає об'єктну форму.  |
| `@opys/mojang`       | Обчислює об'єктну форму. |
| `@opys/core`         | Обчислює обидві форми.   |

## Документація

- [Правила](https://harmoniya-net.github.io/opys/uk/format/rules): як їх вживає маніфест

Частина [opys](https://github.com/harmoniya-net/opys).
