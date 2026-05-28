# @opys/mojang-rules

Pure platform and feature rule evaluation. No side effects, no I/O — just POJOs and functions.

## Install

```sh
npm install @opys/mojang-rules zod
```

## Concepts

A **Rule** either allows or disallows based on OS constraints, feature flags, or unconditionally:

```ts
type Rule =
  | { action: 'allow' | 'disallow'; os: OsConstraint }
  | { action: 'allow' | 'disallow'; features: FeatureConstraint }
  | { action: 'allow' | 'disallow' };
```

A **Ruleset** is an array of rules. All rules must be satisfied for the ruleset to pass.

## API

### `satisfiesRuleset(ruleset, os, feats?)`

Returns `true` if every rule in `ruleset` is satisfied for the given OS and feature set.

```ts
import { satisfiesRuleset } from '@opys/mojang-rules';

const passes = satisfiesRuleset([{ action: 'allow', os: { name: 'linux' } }], {
  name: 'linux',
  version: '6.12',
  arch: 'x86_64',
});
// true
```

Compact "shorthand" parsing of rules lives in `@opys/core`.

### Ruleset helpers

```ts
import { emptyRuleset, allowOsRuleset } from '@opys/mojang-rules';

emptyRuleset(); // []
allowOsRuleset('linux'); // [{ action: 'allow', os: { name: 'linux' } }]
```

### Zod schemas

```ts
import { RuleSchema, RulesetSchema } from '@opys/mojang-rules';

const rule = RuleSchema.parse({ action: 'allow', os: { name: 'osx' } });
const rules = RulesetSchema.parse([...]);
```
