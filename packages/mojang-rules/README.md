# @opys/mojang-rules

[![npm](https://img.shields.io/npm/v/@opys/mojang-rules.svg)](https://www.npmjs.com/package/@opys/mojang-rules)

The types of Mojang's rule format: the `{ action, os, features }` objects
that say which machine a library or an argument is for. Types and two
one-line helpers, with no dependencies and no native code.

```sh
npm install @opys/mojang-rules
```

## Example

```ts
import { satisfiesRuleset } from '@opys/mojang';
import type { MojangRuleset } from '@opys/mojang-rules';

// passes everywhere except macOS
const notMac: MojangRuleset = [
  { action: 'allow' },
  { action: 'disallow', os: { name: 'osx' } },
];

satisfiesRuleset(notMac, { name: 'linux', version: '6.12', arch: 'x86_64' }); // true
```

This package only names the format. Evaluating a rule is
[`@opys/mojang`](https://www.npmjs.com/package/@opys/mojang)'s.

## The format

```text
MojangRuleset
└── MojangRule[]
    ├── action         RuleAction
    ├── os?            OsConstraint
    └── features?      FeatureConstraint
```

### MojangRuleset

A list of rules. It passes when **every** rule in it passes.

<!-- prettier-ignore -->
```jsonc
[]                                            // no rules: passes everywhere
[{ "action": "allow", "os": { "name": "osx" } }]   // macOS only
[
  { "action": "allow", "os": { "name": "linux" } },
  { "action": "allow", "os": { "name": "windows" } }
]                                             // passes nowhere: no machine is both
```

### MojangRule

One condition. A rule has `os`, or `features`, or neither.

| Field       | Type                    | What it is                       |
| ----------- | ----------------------- | -------------------------------- |
| `action`    | `'allow' \| 'disallow'` | Whether a match passes or fails. |
| `os?`       | `OsConstraint`          | The machine it is about.         |
| `features?` | `FeatureConstraint`     | The features it is about.        |

| Rule                                  | Passes when                 |
| ------------------------------------- | --------------------------- |
| `{ action: 'allow' }`                 | Always.                     |
| `{ action: 'allow', os: … }`          | The machine matches.        |
| `{ action: 'disallow', os: … }`       | The machine does not match. |
| `{ action: 'allow', features: … }`    | The features match.         |
| `{ action: 'disallow', features: … }` | The features do not match.  |

### OsConstraint

Which machine. Every field is optional, and every field given must match.

| Field      | Type     | What it is                                            |
| ---------- | -------- | ----------------------------------------------------- |
| `name?`    | `OsName` | `'linux'`, `'windows'` or `'osx'`.                    |
| `arch?`    | `OsArch` | `'x86'`, `'x86_64'`, `'arm'`, `'aarch64'` or `'any'`. |
| `version?` | `string` | A regular expression over the OS version.             |

```jsonc
{ "name": "windows", "arch": "x86_64" }
{ "name": "windows", "version": "^10\\." }
```

### FeatureConstraint

Which features: a map from a feature's name to whether it must be on.

```jsonc
{ "is_demo_user": true }     // matches when the feature is on
{ "java_console": false }    // matches when it is off
```

### OsOptions

The machine a rule is evaluated for. Not part of a rule: it is what you pass
beside one.

| Field     | Type     | What it is                     |
| --------- | -------- | ------------------------------ |
| `name`    | `string` | The OS name, as `OsName`.      |
| `version` | `string` | The OS version.                |
| `arch`    | `string` | The architecture, as `OsArch`. |

## Functions

| Function               | What it returns                       |
| ---------------------- | ------------------------------------- |
| `emptyRuleset()`       | `[]`, the ruleset that always passes. |
| `allowOsRuleset(name)` | A ruleset that passes on one OS.      |

```js
emptyRuleset(); // []
allowOsRuleset('osx'); // [{ action: 'allow', os: { name: 'osx' } }]
```

## The short form is not here

opys also lets a manifest write a rule as a string, `'allow.os.osx'`. That
spelling, and the `Rule` and `Ruleset` types that accept both, are
[`@opys/core`](https://www.npmjs.com/package/@opys/core)'s.

| Package              | Rules it reads             |
| -------------------- | -------------------------- |
| `@opys/mojang-rules` | Names the object form.     |
| `@opys/mojang`       | Evaluates the object form. |
| `@opys/core`         | Evaluates both forms.      |

## Documentation

- [Rules](https://harmoniya-net.github.io/opys/format/rules): how a manifest uses them

Part of [opys](https://github.com/harmoniya-net/opys).
