# @opys/dgpuj

[![npm](https://img.shields.io/npm/v/@opys/dgpuj.svg)](https://www.npmjs.com/package/@opys/dgpuj)

The discrete GPU for opys. `dgpuj()` adds
[dgpuj](https://github.com/harmoniya-net/dgpuj), a small program that starts
Java on the fast graphics card of a laptop that has two.

```sh
npm install -D @opys/dev @opys/dgpuj @opys/java @opys/minecraft-vanilla
```

## Example

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { dgpuj } from '@opys/dgpuj';
import { java } from '@opys/java';
import { minecraft } from '@opys/minecraft-vanilla';

export default defineConfig({
  output: 'game.opys',
  plugins: [minecraft({ version: '1.21.1' }), java({ version: '21' }), dgpuj()],
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

## Options

| Option                     | What it does                                                 |
| -------------------------- | ------------------------------------------------------------ |
| `version`                  | `'latest'` (default), `'prerelease'`, or a tag (`'v0.3.0'`). |
| `platforms`                | Which platforms get it.                                      |
| `repo`, `token`, `apiBase` | Where it is downloaded from, and a GitHub token.             |

## What it adds

`opys build` turns the plugin into these parts of the manifest.

### Files · one archive per platform

Five archives. `rules` pick one, and `extract` takes the executable out.

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

### Launch

One piece, the executable. It goes in `command`, and is told where Java is.

<!-- prettier-ignore -->
```jsonc
// in the manifest
"launch": {
  // '@dgpuj.bin'
  "command": "${dgpuj_bin}",
  "args": [
    "--dgpuj-home",
    // '@java.home'
    "${java_home}",
    // … the game's own arguments
  ]
}
```

### Variables

Where the executable is, per OS.

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

## Every option

Each option, in each way it is used.

```js
// the latest release
dgpuj();

// the latest prerelease, or one exact tag
dgpuj({ version: 'prerelease' });
dgpuj({ version: 'v0.3.0' });

// only some platforms; DEFAULT_PLATFORMS is exported by @opys/dgpuj
dgpuj({ platforms: DEFAULT_PLATFORMS.filter((p) => p.os === 'windows') });

// a fork, with a GitHub token for the rate limit
dgpuj({
  repo: 'my-org/dgpuj',
  token: process.env.GITHUB_TOKEN,
  apiBase: 'https://github.example.com/api/v3',
});
```

## Documentation

- [The full page](https://harmoniya-net.github.io/opys/plugins/dgpuj): every option, and why it works this way
- [The format](https://harmoniya-net.github.io/opys/format/): what a manifest is made of

Part of [opys](https://github.com/harmoniya-net/opys). Also exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
