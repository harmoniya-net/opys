# Java runtime

The `java` plugin, from `@opys/minecraft`.

A Java runtime for every player.

```js
java({ version: '21' });
```

Nothing is installed on your machine. The plugin adds a JDK to the pack,
and each player downloads the one for their computer.

**Why not use the player's Java:** most players have none, or the wrong
one. A pack that brings its own always starts.

## Options

| Option      | What it does                                                  |
| ----------- | ------------------------------------------------------------- |
| `version`   | A major (`'21'`, the newest release of it) or an exact build. |
| `vendor`    | `'temurin'` (default), `'zulu'` or `'graalvm'`.               |
| `platforms` | Which platforms get a JDK. All six by default.                |
| `apiBase`   | A mirror of the vendor's API.                                 |
| `token`     | A GitHub token, for GraalVM's rate limit.                     |

An exact build is written the vendor's way: `'21.0.12.1+1'` or
`'8u312-b07'` for Temurin, `'21.0.12'` for Zulu and GraalVM.

## Which Java for which Minecraft

| Minecraft            | Java |
| -------------------- | ---- |
| Up to 1.16.5         | 8    |
| 1.17 to 1.20.4       | 17   |
| 1.20.5 to 1.21.x     | 21   |
| 26.x                 | 25   |
| Cleanroom, lwjgl3ify | 25   |

opys does not check the pairing. A wrong Java shows up as the game failing
to start.

## What it adds

| Kind        | What                                         |
| ----------- | -------------------------------------------- |
| Files       | One JDK per platform.                        |
| Launch      | `bin`, `home`.                               |
| Variables   | `java_runtime_dir`, `java_home`, `java_bin`. |
| Environment | `JAVA_HOME`.                                 |

Each one below: what it is, and how it ends up in the
[manifest](/format/).

### Files · one JDK per platform

Six archives: Linux, macOS and Windows, each on x86_64 and ARM. The `rules`
mean a player downloads exactly one. `extract` unpacks it.

<!-- prettier-ignore -->
```js{5}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@java.bin',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

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

### Variables

Where the JDK is. The paths differ per OS, which is why they are
variables with one value per platform.

<!-- prettier-ignore -->
```js{5}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@java.bin',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

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

Override `java_runtime_dir` to keep JDKs somewhere else.

### Launch

Two pieces. `bin` you rarely name, since a loader's `command` already
resolves to it. `home` is for something that starts Java for you, such as
[Discrete GPU](./dgpuj#telling-it-where-java-is).

<!-- prettier-ignore -->
```js{11-12}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
    dgpuj(),
  ],
  manifest: {
    command: '@dgpuj.bin',
    args: [
      '--dgpuj-home',
      '@java.home',
      '@minecraft.jvmArgs',
      '@minecraft.mainClass',
      '@minecraft.gameArgs',
    ],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// in the manifest
"launch": {
  "command": "${dgpuj_bin}",
  "args": [
    "--dgpuj-home",
    // '@java.home'
    "${java_home}"
    // …
  ]
}
```

| You write      | Becomes                                   |
| -------------- | ----------------------------------------- |
| `'@java.bin'`  | `${java_bin}`, the `java` executable.     |
| `'@java.home'` | `${java_home}`, the folder the JDK is in. |

**Why pieces, when `${java_bin}` and `${java_home}` exist:** a piece is
checked when you build. A misspelt variable is not.

### Environment · `JAVA_HOME`

Set for the game process. Tools started along with the game find Java
through it.

<!-- prettier-ignore -->
```js{5}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@java.bin',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// in the manifest
"envs": { "JAVA_HOME": "${java_home}" }
```

## Features

| Feature        | Effect                                             |
| -------------- | -------------------------------------------------- |
| `java_console` | On Windows, run `java.exe` instead of `javaw.exe`. |

**Why:** `javaw.exe` shows no console window, which is what players want.
`opys launch --feature java_console` brings the game's output back when you
are debugging.

## Good to know

- A platform the vendor has no build for is left out. A player on it gets
  no Java.
- **Check what Zulu gave you.** Its API answers with its newest JDK when it
  cannot read a version. Look at the `[java]` line the build prints.
- No pack Java at all? Leave the plugin out and supply `java_bin` yourself.
