# Discrete GPU

The `dgpuj` plugin, from `@opys/minecraft`.

Runs the game on the fast graphics card.

<!-- prettier-ignore -->
```js{6,9,11}
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
      '@minecraft.command',
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

| Option                     | What it does                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `version`                  | Left out, the release this version of opys was written for. Or `'latest'`, `'prerelease'`, or a tag (`'v0.6.0'`). |
| `platforms`                | Which platforms get it.                                                                                           |
| `repo`, `token`, `apiBase` | Where it is downloaded from, and a GitHub token.                                                                  |

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
      '@minecraft.command',
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
  "source": { "url": "https://github.com/harmoniya-net/dgpuj/releases/download/v0.6.0/dgpuj-x86_64-pc-windows-msvc.zip" },
  "size": 947,
  "rules": ["allow.os.windows", "allow.arch.x86_64"],
  "integrity": { "sha256": "d90a21ccc99625b450b897b10ac34bd4e36b7fbf03cbd7172133160f2d794fa4" },
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
      '@minecraft.command',
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
      '@minecraft.command',
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

**Why the version is not the newest by default:** what you write in `args`
is dgpuj's own command line, and it has changed between releases. Each
version of opys names the release its docs describe, so a pack gets that
one, and the same one in every build.

## Telling it which Java to run

```js
args: ['@forge.command', '@forge.jvmArgs', …],
```

dgpuj goes in front of an ordinary launch line. The first argument is the
`java` it is to run, and that is what the loader's `command` already is, so
the loader's `command` moves from `command` to the head of `args`.

It may be a path or the bare word `java`, so
[`java({ system: true })`](./java) works here too.

**Why `dgpuj` does not provide this itself:** which Java runs the game is the
loader's to say. Named this way, a config without a loader fails at build
time instead of starting with a broken path.

**Java 8 on Windows** is the exception. It finds its own files from where
its launcher is, so dgpuj has to be installed beside `java.exe`, in the
JDK's `bin`, and given the bare word `java`.

## Good to know

- It ships for Windows and macOS on x86_64 and ARM, and for Linux on
  x86_64. There is no Linux ARM build.
- On macOS there is nothing to force, so it only starts Java.
- On Linux it acts only when the proprietary NVIDIA driver is present.
