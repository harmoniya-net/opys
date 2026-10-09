# @opys/mojang-rules

[![npm](https://img.shields.io/npm/v/@opys/mojang-rules.svg)](https://www.npmjs.com/package/@opys/mojang-rules)

The TypeScript types of Mojang's rule format, the `{ action, os, features }`
objects that say which platform a library or an argument is for. Types only:
no code, no dependencies.

```sh
npm install @opys/mojang-rules
```

```ts
import { satisfiesRuleset } from '@opys/mojang';
import type { MojangRuleset } from '@opys/mojang-rules';

// Passes everywhere except macOS.
const notMac: MojangRuleset = [
  { action: 'allow' },
  { action: 'disallow', os: { name: 'osx' } },
];

satisfiesRuleset(notMac, { name: 'linux', version: '6.12', arch: 'x86_64' }); // true
```

- A ruleset passes when **every** rule in it passes. So two `allow` rules for
  two different operating systems pass nowhere.
- The functions that evaluate rules are in `@opys/mojang` (strict) and
  `@opys/core` (which also accepts the short form, `'allow.os.linux'`).

## Documentation

- [Rules](https://harmoniya-net.github.io/opys/format/rules)

Part of [opys](https://github.com/harmoniya-net/opys).
