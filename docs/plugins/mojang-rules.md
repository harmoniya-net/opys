# @opys/mojang-rules

`@opys/mojang-rules` holds the types of Mojang's rule format: a rule that allows
or disallows something for an operating system or a feature. Use it to name the
rule types in your own code. The package has no native code and no
dependencies. Its only runtime code is two factory functions, listed below.
Evaluation lives in [`@opys/mojang`](/plugins/mojang).

```sh
npm install @opys/mojang-rules
```

## The shape of a rule

A rule has an action and at most one constraint:

```ts
type RuleAction = 'allow' | 'disallow';

type MojangRule =
  | { action: RuleAction; os: OsConstraint }
  | { action: RuleAction; features: FeatureConstraint }
  | { action: RuleAction };

type MojangRuleset = MojangRule[];
```

In Mojang's JSON, a rule looks like this:

```json
{ "action": "allow", "os": { "name": "linux" } }
{ "action": "disallow", "os": { "name": "osx", "arch": "aarch64" } }
{ "action": "allow", "features": { "is_demo_user": true } }
{ "action": "allow" }
```

The `Mojang` prefix matters. A manifest may also write a rule as a shorthand
string, such as `'allow.os.linux'`. [`@opys/core`](/plugins/core) accepts both
spellings, and its `Rule` and `Ruleset` types admit both. The types here are
the expanded form that every rule is parsed into. See
[The shorthand](#the-shorthand) below.

## Types

```ts
type OsName = 'linux' | 'windows' | 'osx';

type OsArch = 'x86' | 'x86_64' | 'arm' | 'aarch64' | 'any';

interface OsOptions {
  name: string;
  version: string;
  arch: string;
}

interface OsConstraint {
  readonly name?: OsName;
  readonly version?: string;
  readonly arch?: OsArch;
}

type FeatureConstraint = Record<string, boolean>;
```

- `OsOptions` describes the platform a ruleset is evaluated on. A constraint's
  `name` and `arch` must equal the platform's `name` and `arch`. The value `any`
  is not a wildcard: it equals only a platform whose `arch` is the string `any`.
- `OsConstraint` sets any of the three fields. Each field that is set must
  match. A field that is not set is ignored. `version` is a regular expression,
  which is matched against the platform's version anywhere in the string, not
  as a whole. The pattern is in Rust `regex` syntax, which has no look-around or
  backreferences. Evaluation throws on a pattern that is not valid, once the
  `name` and `arch` of the same constraint have matched.
- `FeatureConstraint` maps each feature name to `true` or `false`. A value of
  `true` means the feature must be on. `false` means it must be off.

## Helpers

```ts
function emptyRuleset(): MojangRuleset;
function allowOsRuleset(name: OsName): MojangRuleset;
```

`emptyRuleset()` returns `[]`. `allowOsRuleset('linux')` returns
`[{ action: 'allow', os: { name: 'linux' } }]`.

## How a ruleset is evaluated

A ruleset is satisfied when every rule in it is satisfied. The evaluator does not
pick a rule, as first-match or last-match would. It checks each rule in turn and
stops at the first one that is not satisfied. An empty ruleset is satisfied.

A single rule is satisfied as follows:

| Rule                       | Satisfied when                                           |
| -------------------------- | -------------------------------------------------------- |
| `allow`, no constraint     | Always.                                                  |
| `disallow`, no constraint  | Never.                                                   |
| `allow` with `os`          | The `os` constraint holds on the platform.               |
| `disallow` with `os`       | The `os` constraint does not hold.                       |
| `allow` with `features`    | Every listed feature is on or off, as its value says.    |
| `disallow` with `features` | Not every listed feature is on or off as its value says. |

An `os` constraint holds when each field it sets matches. A `features` constraint
holds when each feature in it matches.

Because every rule must hold, two `allow` rules do not add up to an "either"
test:

```ts
// Satisfied on no platform. Linux fails the windows rule and windows fails the linux rule.
const bad: MojangRuleset = [
  { action: 'allow', os: { name: 'linux' } },
  { action: 'allow', os: { name: 'windows' } },
];

// Satisfied everywhere except osx.
const notOsx: MojangRuleset = [
  { action: 'allow' },
  { action: 'disallow', os: { name: 'osx' } },
];
```

Evaluate a ruleset with the functions in [`@opys/mojang`](/plugins/mojang):

```ts
import { satisfiesRuleset } from '@opys/mojang';

satisfiesRuleset(notOsx, { name: 'linux', version: '6.12', arch: 'x86_64' }); // true
```

## Reading a rule

A rule read from JSON is taken as an `os` rule if it fits that shape, then as a
`features` rule, then as a bare `allow` or `disallow`. Keys it does not know are
ignored.

::: warning Two constraints, or one that cannot be read
A rule that gives both `os` and `features` keeps only `os`. A rule whose `os`
cannot be read, such as `{ "name": "solaris" }` or an unknown `arch`, is read as
a bare rule with no constraint: an `allow` then holds on every platform and a
`disallow` on none. Neither case is reported as an error.
:::

## The shorthand

A manifest may write a rule as a string. The string is a dot-separated path:
an action, then what the rule is about, then the value.

| Shorthand                       | Expanded                                                       |
| ------------------------------- | -------------------------------------------------------------- |
| `'allow'`                       | `{ action: 'allow' }`                                          |
| `'disallow'`                    | `{ action: 'disallow' }`                                       |
| `'allow.os.osx'`                | `{ action: 'allow', os: { name: 'osx' } }`                     |
| `'allow.os.linux@10\\.'`        | `{ action: 'allow', os: { name: 'linux', version: '10\\.' } }` |
| `'allow.arch.x86_64'`           | `{ action: 'allow', os: { arch: 'x86_64' } }`                  |
| `'allow.features.is_demo_user'` | `{ action: 'allow', features: { is_demo_user: true } }`        |

In the shorthand, a feature always names `true`. To require a feature to be
off, use `disallow`: `'disallow.features.is_demo_user'` is satisfied when the
feature is absent. The text after `@` in an `os` rule is the `version` pattern.
A shorthand cannot set both an OS name and an architecture.

The shorthand belongs to `@opys/core`. The two packages that evaluate rules
differ in what they accept:

| Package                           | Accepts the shorthand                                                       |
| --------------------------------- | --------------------------------------------------------------------------- |
| [`@opys/core`](/plugins/core)     | Yes. Its `Ruleset` takes a string, an expanded rule, or an array of either. |
| [`@opys/mojang`](/plugins/mojang) | No. `decodeRuleset('allow.os.linux')` throws.                               |

A manifest's rules are described in [the manifest reference](/reference/manifest).
