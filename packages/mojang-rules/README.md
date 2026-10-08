# @opys/mojang-rules

The types of Mojang's rule format: a rule that allows or disallows something for an operating system or a feature. The package has no native code and no dependencies, and its only runtime code is two factory functions. Evaluation lives in `@opys/mojang`.

```sh
npm install @opys/mojang-rules
```

```ts
import { satisfiesRuleset } from '@opys/mojang';
import type { MojangRuleset } from '@opys/mojang-rules';

// Satisfied everywhere except osx.
const notOsx: MojangRuleset = [
  { action: 'allow' },
  { action: 'disallow', os: { name: 'osx' } },
];

satisfiesRuleset(notOsx, { name: 'linux', version: '6.12', arch: 'x86_64' }); // true
```

- A rule is an action (`allow` or `disallow`) with at most one constraint, `os` or `features`. A ruleset is an array of rules.
- A ruleset is satisfied when every rule in it is. The evaluator does not pick the first or last match, so two `allow` rules for different operating systems are satisfied on no platform.
- The `Mojang` prefix marks the expanded form. A manifest may also write a rule as shorthand, such as `'allow.os.linux'`; `@opys/core` accepts both spellings and `@opys/mojang` rejects the shorthand.
- A rule with both `os` and `features` keeps only `os`, and a rule whose `os` cannot be read is read as a bare rule. Neither is reported as an error.

## Documentation

- [@opys/mojang-rules](https://harmoniya-net.github.io/opys/plugins/mojang-rules): the types, the helpers, how a ruleset is evaluated and the shorthand.
