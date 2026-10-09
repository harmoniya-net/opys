# Rules

A rule says where something applies: "only on Windows", "not on ARM", "only
when this feature is on".

```json
"rules": "allow.os.windows"
```

`rules` is one rule or a list. Absent means "always".

## In a config

Vanilla Minecraft, with a rule in each of the three places a config can
have one:

<!-- prettier-ignore -->
```js{9,14-15,22-26}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
    files({
      from: 'tools',
      to: (file) => '${game_directory}/tools/' + file.rel,
    }).addRule('**/*.dll', 'allow.os.windows'), // a file: installed only on Windows
  ],
  manifest: {
    command: '@minecraft.command',
    args: [
      // an argument: passed only on macOS
      { rules: 'allow.os.osx', value: ['-Xdock:name=My Pack'] },
      '@minecraft.jvmArgs',
      '@minecraft.mainClass',
      '@minecraft.gameArgs',
    ],
    workdir: '${game_directory}',
    vars: {
      // a variable: the last value whose rules pass wins
      pack_label: [
        { value: 'My Pack' },
        { value: 'My Pack (Mac)', rules: 'allow.os.osx' },
      ],
    },
  },
});
```

## Two ways to write a rule

Both mean the same, and a reader must accept both.

### Short

A string. This is what you write in a config.

| Rule                          | Passes                                      |
| ----------------------------- | ------------------------------------------- |
| `allow.os.windows`            | On Windows.                                 |
| `allow.os.linux`              | On Linux.                                   |
| `allow.os.osx`                | On macOS.                                   |
| `allow.arch.aarch64`          | On ARM64.                                   |
| `allow.arch.x86_64`           | On 64-bit Intel and AMD.                    |
| `allow.features.java_console` | When that feature is switched on.           |
| `allow.os.osx@^14`            | On macOS whose version matches the pattern. |
| `disallow.os.osx`             | Everywhere except macOS.                    |
| `allow`                       | Always.                                     |
| `disallow`                    | Never.                                      |

`disallow` takes every form `allow` does.

### Long

An object. This is Mojang's own form, and what the game's version files
use.

```json
{ "action": "allow", "os": { "name": "osx", "arch": "aarch64" } }
```

```json
{ "action": "disallow", "features": { "is_demo_user": true } }
```

| Field      | What it is                                                        |
| ---------- | ----------------------------------------------------------------- |
| `action`   | `allow` or `disallow`. Required.                                  |
| `os`       | Any of `name`, `arch`, `version`. All given ones must match.      |
| `features` | Feature names, each `true` (must be on) or `false` (must be off). |

Use the long form when the short one cannot say it, such as an OS **and**
an architecture in one rule. Give a rule `os` or `features`, not both.

## How a ruleset is decided

1. A rule has a condition (`os`, `features`, or none). No condition always
   holds.
2. An `allow` rule passes when its condition holds. A `disallow` rule passes
   when it does not.
3. **The ruleset passes when every rule passes.**

```json
["allow.os.linux", "disallow.features.demo"]
```

Passes on Linux, when `demo` is off.

::: warning Every rule, not any rule
Two `allow` rules for two operating systems pass nowhere, because no machine
is both. For "Windows or Linux", write `disallow.os.osx`, or use two
artifacts.
:::

## What a machine reports

| Value     | Possible values                         |
| --------- | --------------------------------------- |
| `name`    | `linux`, `windows`, `osx`               |
| `arch`    | `x86_64`, `aarch64`                     |
| `version` | Empty, unless the launcher supplies it. |

The opys runtime does not detect the OS version. A rule with a version
pattern only works if the launcher passes a `platform` with one.

## Features

A feature is a named switch, off by default. A launcher turns it on with
`features: ['java_console']`, the CLI with `--feature java_console`.

The known ones are listed on
[Variables](/plugins/minecraft#features).
