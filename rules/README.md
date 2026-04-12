# @unifest/rules

Pure platform and feature rule evaluation. No side effects, no I/O — just POJOs and functions.

## Install

```sh
bun add @unifest/rules zod
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
import { satisfiesRuleset } from '@unifest/rules';

const passes = satisfiesRuleset([{ action: 'allow', os: { name: 'linux' } }], {
  name: 'linux',
  arch: 'x64',
});
// true
```

### Shorthand codec

Rules can be expressed as compact strings. Use `ShortRule` and `ShortRuleset` to parse/encode them.

| String                          | Meaning                            |
| ------------------------------- | ---------------------------------- |
| `'allow'`                       | Unconditional allow                |
| `'disallow'`                    | Unconditional disallow             |
| `'allow.os.linux'`              | Allow on Linux                     |
| `'disallow.os.windows'`         | Disallow on Windows                |
| `'allow.os.osx@10.5+'`          | Allow on macOS with version filter |
| `'allow.arch.x86'`              | Allow on x86 architecture          |
| `'allow.features.is_demo_user'` | Allow when feature flag is set     |

```ts
import { ShortRuleset, parseShortRuleset } from '@unifest/rules';

const rules = ShortRuleset.decode(['allow.os.linux', 'disallow.os.windows']);
const encoded = ShortRuleset.encode(rules);
// encoded: ['allow.os.linux', 'disallow.os.windows']
```

### Ruleset helpers

```ts
import { emptyRuleset, allowOsRuleset } from '@unifest/rules';

emptyRuleset(); // []
allowOsRuleset('linux'); // [{ action: 'allow', os: { name: 'linux' } }]
```

### Zod schemas

```ts
import { RuleSchema, RulesetSchema } from '@unifest/rules';

const rule = RuleSchema.parse({ action: 'allow', os: { name: 'osx' } });
const rules = RulesetSchema.parse([...]);
```
