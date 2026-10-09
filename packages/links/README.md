# @opys/links

[![npm](https://img.shields.io/npm/v/@opys/links.svg)](https://www.npmjs.com/package/@opys/links)

Files by link for opys. `links()` adds any file you have a URL for, pinned by
its hash.

```sh
npm install -D @opys/dev @opys/links @opys/fabric @opys/java
```

## Example

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { fabric } from '@opys/fabric';
import { java } from '@opys/java';
import { links } from '@opys/links';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    fabric({ version: '1.21.1' }),
    java({ version: '21' }),
    links({
      links: [
        'https://modrinth.com/mod/sodium/version/SMxNOGZ6',
        'https://maven.fabricmc.net/…/fabric-api-0.116.0+1.21.1.jar',
      ],
      to: (file) => '${game_directory}/mods/' + file.filename,
    }),
  ],
  manifest: {
    command: '@fabric.command',
    args: ['@fabric.jvmArgs', '@fabric.mainClass', '@fabric.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

## Options

| Option                                      | What it does                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| `links`                                     | The URLs: GitHub, GitLab, Modrinth, CurseForge, or anything else.                       |
| `to`                                        | Where each file goes. Called with `{ filename, link, url, provider, size, integrity }`. |
| `curseforgeToken`                           | Required for CurseForge links.                                                          |
| `githubToken`                               | Raises GitHub's rate limit. Reaches private repos.                                      |
| `gitlabToken`                               | Reaches private GitLab projects.                                                        |
| `githubApi`, `modrinthApi`, `curseforgeApi` | Mirrors.                                                                                |

Start the path `to` returns with a variable such as `${game_directory}`. It is
filled in on the player's machine.

## What it adds

`opys build` turns the plugin into these parts of the manifest.

### Files · a link to a site it knows

The site says which file it is and what its hash is.

<!-- prettier-ignore -->
```jsonc
// in the manifest
{
  "path": "${game_directory}/mods/sodium-fabric-0.8.13+mc1.21.1.jar",
  "source": { "url": "https://cdn.modrinth.com/data/AANobbMI/versions/SMxNOGZ6/sodium-fabric-0.8.13%2Bmc1.21.1.jar" },
  "size": 1574609,
  "integrity": { "sha1": "003c114c85ca88ef3362e018deb6aca0c682d6a1" }
}
```

### Files · any other link

Nobody publishes a hash, so opys downloads the file once while building and
hashes it itself.

<!-- prettier-ignore -->
```jsonc
// in the manifest
{
  "path": "${game_directory}/mods/fabric-api-0.116.0+1.21.1.jar",
  "source": { "url": "https://maven.fabricmc.net/…/fabric-api-0.116.0+1.21.1.jar" },
  "size": 2410624,
  "integrity": { "sha256": "8604ed0741bd16f82dceb13f3ad2db28b002a9cd7972da74325530f65a31e939" }
}
```

No launch pieces and no variables.

## Every option

Each option, in each way it is used.

```js
// one link of each kind
links({
  links: [
    'https://github.com/owner/repo/releases/download/v1.0/mod-1.0.jar',
    'https://gitlab.com/api/v4/projects/owner%2Frepo/packages/generic/tool/1.0/tool.jar',
    'https://modrinth.com/mod/sodium/version/SMxNOGZ6',
    'https://www.curseforge.com/minecraft/mc-mods/jei/files/6307712',
    'https://example.com/files/anything.jar',
  ],
  to: (file) => '${game_directory}/mods/' + file.filename,
  curseforgeToken: process.env.CURSEFORGE_TOKEN, // required for the CurseForge link
});

// `to` decides per file: here, by where the link points
links({
  links: [
    'https://modrinth.com/mod/sodium/version/SMxNOGZ6',
    'https://example.com/pack.zip',
  ],
  to: (file) =>
    file.provider === 'url'
      ? '${game_directory}/resourcepacks/' + file.filename
      : '${game_directory}/mods/' + file.filename,
});

// private repositories, and a higher GitHub rate limit
links({
  links: [
    'https://github.com/my-org/private/releases/download/v1.0/mod-1.0.jar',
  ],
  to: (file) => '${game_directory}/mods/' + file.filename,
  githubToken: process.env.GITHUB_TOKEN,
  gitlabToken: process.env.GITLAB_TOKEN,
});

// mirrors of the APIs
links({
  links: ['https://modrinth.com/mod/sodium/version/SMxNOGZ6'],
  to: (file) => '${game_directory}/mods/' + file.filename,
  githubApi: 'https://github.example.com/api/v3',
  modrinthApi: 'https://mirror.example.com/modrinth/v2',
  curseforgeApi: 'https://mirror.example.com/curseforge/v1',
});
```

## Documentation

- [The full page](https://harmoniya-net.github.io/opys/plugins/links): every option, and why it works this way
- [The format](https://harmoniya-net.github.io/opys/format/): what a manifest is made of

Part of [opys](https://github.com/harmoniya-net/opys). Also exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
