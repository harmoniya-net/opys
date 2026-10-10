# @opys/java

[![npm](https://img.shields.io/npm/v/@opys/java.svg)](https://www.npmjs.com/package/@opys/java)

Java for opys. `java()` adds a JDK to a pack, so players need none installed.

```sh
npm install -D @opys/dev @opys/java @opys/minecraft-vanilla
```

## Example

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { java } from '@opys/java';
import { minecraft } from '@opys/minecraft-vanilla';

export default defineConfig({
  output: 'game.opys',
  plugins: [minecraft({ version: '1.21.1' }), java({ version: '21' })],
  manifest: {
    command: '@minecraft.command',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Options

| Option      | What it does                                                                             |
| ----------- | ---------------------------------------------------------------------------------------- |
| `version`   | A major (`'21'`, its newest release) or an exact build (`'21.0.12.1+1'`, `'8u312-b07'`). |
| `vendor`    | `'temurin'` (default), `'zulu'` or `'graalvm'`.                                          |
| `platforms` | Which platforms get a JDK. All six by default.                                           |
| `apiBase`   | A mirror of the vendor's API.                                                            |
| `token`     | A GitHub token, for GraalVM's rate limit.                                                |
| `system`    | `true` ships no JDK and uses the machine's own. It goes with no other option.            |

Which Java for which Minecraft:

| Minecraft            | Java |
| -------------------- | ---- |
| Up to 1.16.5         | 8    |
| 1.17 to 1.20.4       | 17   |
| 1.20.5 to 1.21.x     | 21   |
| 26.x                 | 25   |
| Cleanroom, lwjgl3ify | 25   |

opys does not check the pairing.

## The machine's own Java

`java({ system: true })` ships no JDK. The game runs on a Java that is
already installed.

```js
plugins: [minecraft({ version: '1.21.1' }), java({ system: true })],
```

Nothing is downloaded. The plugin only says where `java` is:

| Feature `custom_java` | `java_bin`                                        |
| --------------------- | ------------------------------------------------- |
| off (default)         | `java`, found on the `PATH`.                      |
| on                    | `${java_home}/bin/java`, from the launcher's var. |

<!-- prettier-ignore -->
```jsonc
// in the manifest
"vars": {
  "java_bin": [
    { "value": "java" },
    { "value": "javaw", "rules": ["allow.os.windows", "disallow.features.java_console"] },
    { "value": "${java_home}/bin/java", "rules": "allow.features.custom_java" },
    { "value": "${java_home}/bin/javaw.exe", "rules": ["allow.os.windows", "allow.features.custom_java", "disallow.features.java_console"] },
    { "value": "${java_home}/bin/java.exe", "rules": ["allow.os.windows", "allow.features.custom_java", "allow.features.java_console"] }
  ]
},
"launch": {
  "envs": { "JAVA_HOME": [{ "value": "${java_home}", "rules": "allow.features.custom_java" }] }
}
```

Let the player choose their Java with two options:

```js
options: options()
  .feature('custom_java', (o) => o.directory('java_home').title('Java folder'))
  .title('Use my own Java'),
```

- `java_home` is the JDK's folder, the one that holds `bin`. On macOS that
  is `…/Contents/Home`.
- It has only `'@java.bin'`. There is no `'@java.home'`, since the pack does
  not know where a JDK is.
- No other option goes with `system`. `java({ system: true, version: '21' })`
  is refused: opys cannot promise which Java the machine has.
- Nothing checks the version. A wrong Java shows up as the game failing to
  start.

## What it adds

`opys build` turns the plugin into these parts of the manifest.

### Files · one JDK per platform

Six archives. The `rules` mean a player downloads exactly one.

<!-- prettier-ignore -->
```jsonc
// in the manifest
{
  "path": "${java_runtime_dir}/OpenJDK21U-jdk_x64_linux_hotspot_21.0.12.1_1.tar.gz",
  "source": { "url": "https://github.com/adoptium/temurin21-binaries/releases/download/…_x64_linux_….tar.gz" },
  "size": 207473347,
  "rules": ["allow.os.linux", "allow.arch.x86_64"],
  "integrity": { "sha256": "ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94" },
  "extract": { "matches": "*", "into": "${java_runtime_dir}/jdk-21", "strip": ["*/"] }
}
```

### Launch

Two pieces. A loader's `command` already resolves to `bin`. `home` is for
something that starts Java for you.

| You write      | In the manifest  |
| -------------- | ---------------- |
| `'@java.bin'`  | `"${java_bin}"`  |
| `'@java.home'` | `"${java_home}"` |

### Variables

Where the JDK is, per OS.

<!-- prettier-ignore -->
```jsonc
// in the manifest
"vars": {
  "java_runtime_dir": "${root}/runtimes",
  "java_home": [
    { "value": "${java_runtime_dir}/jdk-21", "rules": "allow.os.linux" },
    { "value": "${java_runtime_dir}/jdk-21/Contents/Home", "rules": "allow.os.osx" },
    { "value": "${java_runtime_dir}/jdk-21", "rules": "allow.os.windows" }
  ],
  "java_bin": [
    { "value": "${java_home}/bin/java", "rules": "allow.os.linux" },
    { "value": "${java_home}/bin/java", "rules": "allow.os.osx" },
    { "value": "${java_home}/bin/javaw.exe", "rules": ["allow.os.windows", "disallow.features.java_console"] },
    { "value": "${java_home}/bin/java.exe", "rules": ["allow.os.windows", "allow.features.java_console"] }
  ]
}
```

### Environment

Set for the game process.

<!-- prettier-ignore -->
```jsonc
// in the manifest
"envs": { "JAVA_HOME": "${java_home}" }
```

## Every option

Each option, in each way it is used.

```js
// the newest release of a major version
java({ version: '21' });

// one exact build: the same in every build of the pack
java({ version: '21.0.12.1+1' });
java({ version: '8u312-b07' });

// another vendor
java({ version: '21', vendor: 'zulu' });
java({ version: '21', vendor: 'graalvm', token: process.env.GITHUB_TOKEN });

// only some platforms, for a pack that runs on Windows alone
java({
  version: '21',
  platforms: [
    { os: 'windows', arch: 'x86_64' },
    { os: 'windows', arch: 'aarch64' },
  ],
});

// a mirror of the vendor's API
java({ version: '21', apiBase: 'https://mirror.example.com/adoptium/v3' });

// no JDK: the machine's own Java
java({ system: true });
java({ system: true, version: '21' });
// build fails: java({ system: true }) ships no JDK, so `version` has nothing to apply to
```

## Documentation

- [The full page](https://harmoniya-net.github.io/opys/plugins/java): every option, and why it works this way
- [The format](https://harmoniya-net.github.io/opys/format/): what a manifest is made of

Part of [opys](https://github.com/harmoniya-net/opys). Also exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
