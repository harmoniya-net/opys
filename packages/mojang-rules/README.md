# @opys/mojang-rules

The Mojang-standard rule format — `os` / `features` / `rule` / `ruleset` — as
TypeScript types.

**Types only.** No zod, no native code, no dependencies. The package exists so
both sides of the build/runtime wall can name the rule contract without
pulling anything in.

## Install

```sh
npm install @opys/mojang-rules
```

## Concepts

A **Rule** either allows or disallows based on OS constraints, feature flags,
or unconditionally:

```ts
type Rule =
  | { action: 'allow' | 'disallow'; os: OsConstraint }
  | { action: 'allow' | 'disallow'; features: FeatureConstraint }
  | { action: 'allow' | 'disallow' };
```

A **Ruleset** is an array of rules. All rules must be satisfied for the ruleset
to pass.

## Helpers

```ts
import { emptyRuleset, allowOsRuleset } from '@opys/mojang-rules';

emptyRuleset(); // []
allowOsRuleset('linux'); // [{ action: 'allow', os: { name: 'linux' } }]
```

## Evaluation

Evaluation lives in Rust ([`opys-mojang-rules`](https://crates.io/crates/opys-mojang-rules))
and reaches JavaScript through two packages with deliberately different
contracts:

| Package                                                  | Contract                                                               |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`@opys/mojang`](https://npmjs.com/package/@opys/mojang) | **Strict** Mojang format. `'allow.os.linux'` is an error.              |
| [`@opys/core`](https://npmjs.com/package/@opys/core)     | Additionally expands the opys shorthand, so it accepts both spellings. |

```ts
import { satisfiesRuleset } from '@opys/mojang';

satisfiesRuleset([{ action: 'allow', os: { name: 'linux' } }], {
  name: 'linux',
  version: '6.12',
  arch: 'x86_64',
});
// true
```
