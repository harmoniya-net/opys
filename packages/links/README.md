# @opys/links

[![npm](https://img.shields.io/npm/v/@opys/links.svg)](https://www.npmjs.com/package/@opys/links)

Turn a link into a pinned file. Paste a URL you already have, such as a GitHub release asset or a Modrinth version page, and `links()` finds its size and hash when you build.

```sh
npm install -D @opys/dev @opys/minecraft @opys/links
```

```js
import { fabric, java } from '@opys/minecraft';
import { links } from '@opys/links';

// In the `plugins` of defineConfig():
plugins: [
  fabric('1.21.1'),
  java('21'),
  links({
    path: (file) => '${game_directory}/mods/' + file.filename,
    links: [
      'https://modrinth.com/mod/sodium/version/SMxNOGZ6',
      'https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/0.116.0+1.21.1/fabric-api-0.116.0+1.21.1.jar',
    ],
  }),
],
```

- Every link is resolved at build time. The manifest carries the size, URL and hash, and a `latest` link is pinned to the release it meant that day.
- GitHub release assets, GitLab generic-package files, Modrinth version pages and CurseForge file pages are recognised. CurseForge needs `curseforgeToken`. Any other `http(s)` URL is downloaded once and hashed.
- A link that matches none of these is taken as the file itself, so a Modrinth project page, which has no `/version/`, pins its HTML and not a mod.
- One `path` function serves every link in a `links()` call.

## Documentation

- [links plugin](https://harmoniya-net.github.io/opys/plugins/link): options, link shapes, where each hash comes from
- [Mods and files](https://harmoniya-net.github.io/opys/guide/mods): choosing between `modrinth`, `curseforge`, `links` and `files`

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit; re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
