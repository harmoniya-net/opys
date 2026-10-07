# @opys/link

[![npm](https://img.shields.io/npm/v/@opys/link.svg)](https://www.npmjs.com/package/@opys/link)

Turn a link into an artifact. Paste the URL you already have — a GitHub
release asset, a file in a GitLab package registry, a mod's page on Modrinth or
CurseForge, or any address a file is served from — and it resolves, at build
time, to a pinned download.

```sh
npm install @opys/link
```

```js
import { defineConfig } from '@opys/dev';
import { links } from '@opys/link';

export default defineConfig({
  plugins: [
    links({
      path: (file) => '${game_directory}/mods/' + file.filename,
      links: [
        'https://modrinth.com/mod/sodium/version/JjCVwmVA',
        'https://www.curseforge.com/minecraft/mc-mods/jei/files/6307712',
        'https://github.com/owner/repo/releases/latest/download/mod.jar',
        'https://example.com/files/custom-mod.jar',
      ],
      curseforgeToken: process.env.CURSEFORGE_TOKEN,
    }),
  ],
});
```

| Link                                                                         | Hash comes from                                                        |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `github.com/<owner>/<repo>/releases/download/<tag>/<asset>`                  | GitHub's asset digest; hashed at build time for assets older than 2024 |
| `github.com/<owner>/<repo>/releases/latest/download/<asset>`                 | the same, on the newest stable release that has the asset              |
| `<gitlab>/api/v4/projects/<project>/packages/generic/<pkg>/<version>/<file>` | the registry's `file_sha256`                                           |
| `modrinth.com/…/version/<id>`                                                | Modrinth's sha1                                                        |
| `curseforge.com/…/files/<id>`                                                | CurseForge's sha1 — needs `curseforgeToken`                            |
| anything else                                                                | downloaded once at build time and hashed                               |

Every link is resolved when the manifest is built, never on the installing
machine. A `latest` link is pinned to the release it meant that day; rebuild the
manifest to follow it.

`path` receives the resolved file — `{ link, provider, filename, url, size,
integrity }` — and returns where it goes. Use `links()` once per destination.

Tokens are optional except for CurseForge: `githubToken` raises the rate limit
and reaches private repositories, `gitlabToken` reaches private projects.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
