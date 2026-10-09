# Discrete GPU

The `dgpuj` plugin, from `@opys/minecraft`.

Runs the game on the fast graphics card.

<!-- prettier-ignore -->
```js{6,9,11-12}
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

On a laptop with two GPUs, Windows and Linux choose one per program, and
often choose the slow one for Java.

**Why a launcher cannot fix that from outside:** the choice belongs to the
process that opens the window. So
[dgpuj](https://github.com/harmoniya-net/dgpuj) _becomes_ that process. It
asks for the fast card, then runs Java inside itself.

## Options

| Option                     | What it does                                                 |
| -------------------------- | ------------------------------------------------------------ |
| `version`                  | `'latest'` (default), `'prerelease'`, or a tag (`'v0.3.0'`). |
| `platforms`                | Which platforms get it.                                      |
| `repo`, `token`, `apiBase` | Where it is downloaded from, and a GitHub token.             |

## What it adds

| Kind        | What                            |
| ----------- | ------------------------------- |
| Files       | One small archive per platform. |
| Launch      | `bin`.                          |
| Variables   | `dgpuj_dir`, `dgpuj_bin`.       |
| Environment | None.                           |

Each one below: what it is, and how it ends up in the
[manifest](/format/).

### Files · one archive per platform

Five archives. `rules` pick the one for the player's machine, and `extract`
takes the single executable out of it.

<!-- prettier-ignore -->
```js{6}
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
{
  "path": "${dgpuj_dir}/dgpuj-x86_64-pc-windows-msvc.zip",
  "source": { "url": "https://github.com/harmoniya-net/dgpuj/releases/download/v0.3.0/dgpuj-x86_64-pc-windows-msvc.zip" },
  "size": 77321,
  "rules": ["allow.os.windows", "allow.arch.x86_64"],
  "integrity": { "sha256": "3dc7ef481abdd390cbb0ba23137d808b4b8652b23a49915f761a4bc422969a13" },
  "extract": { "file": "dgpuj.exe", "into": "${dgpuj_dir}/dgpuj.exe" }
}
```

### Variables

Where the executable is, per OS.

<!-- prettier-ignore -->
```js{6}
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
"vars": {
  "dgpuj_dir": "${root}/dgpuj",
  "dgpuj_bin": [
    { "value": "${dgpuj_dir}/dgpuj.exe", "rules": "allow.os.windows" },
    { "value": "${dgpuj_dir}/dgpuj", "rules": "allow.os.linux" },
    { "value": "${dgpuj_dir}/dgpuj", "rules": "allow.os.osx" }
  ]
}
```

### Launch · `@dgpuj.bin`

The dgpuj executable. It goes in `command`, because it has to be the
program that starts.

<!-- prettier-ignore -->
```js{9}
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
"command": "${dgpuj_bin}"
```

This is the one case where `command` does not come from the loader.

## Telling it where Java is

```js
args: ['--dgpuj-home', '@java.home', '@forge.jvmArgs', …],
```

`--dgpuj-home` is dgpuj's own flag, and
[`@java.home`](./java#what-it-adds) is the JDK the `java` plugin installed.
Put the pair first in `args`.

**Why `dgpuj` does not provide this itself:** where Java is, is the `java`
plugin's to say. Named this way, a config without `java` fails at build
time instead of starting with a broken path.

You may leave the pair out. `java` also sets `JAVA_HOME`, and dgpuj reads
that.

## Good to know

- It ships for Windows and macOS on x86_64 and ARM, and for Linux on
  x86_64. There is no Linux ARM build.
- On macOS there is nothing to force, so it only starts Java.
- On Linux it acts only when the proprietary NVIDIA driver is present.
