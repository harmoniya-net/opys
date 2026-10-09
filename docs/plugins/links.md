# Files by link

The `links` plugin, from `@opys/minecraft`.

Any file you have a URL for.

It is not tied to Minecraft: a link is a link. Today the sites it knows by
name are mostly where mods live, and any other URL still works.

```js
links({
  to: (file) => '${game_directory}/mods/' + file.filename,
  links: [
    'https://modrinth.com/mod/sodium/version/JjCVwmVA',
    'https://github.com/owner/repo/releases/download/v1.2/mod.jar',
    'https://github.com/owner/repo/releases/latest/download/mod.jar',
    'https://example.com/files/custom-mod.jar',
  ],
});
```

## Options

| Option            | What it does                                       |
| ----------------- | -------------------------------------------------- |
| `links`           | The URLs.                                          |
| `to`              | Where each file goes.                              |
| `curseforgeToken` | Required for CurseForge links.                     |
| `githubToken`     | Raises GitHub's rate limit. Reaches private repos. |
| `gitlabToken`     | Reaches private GitLab projects.                   |

There are also `githubApi`, `modrinthApi` and `curseforgeApi`, for mirrors.

### to

Called once per file. Returns where that file is installed.

| `file.`     | Is                                                     |
| ----------- | ------------------------------------------------------ |
| `filename`  | The file's name.                                       |
| `link`      | The link as you wrote it.                              |
| `url`       | Where it is really downloaded from.                    |
| `provider`  | `github`, `gitlab`, `modrinth`, `curseforge` or `url`. |
| `size`      | Size in bytes.                                         |
| `integrity` | The hash it was pinned with.                           |

Start the path with a variable such as `${game_directory}`. It is filled
in on the player's machine.

## What it adds

| Kind        | What          |
| ----------- | ------------- |
| Files       | One per link. |
| Launch      | None.         |
| Variables   | None.         |
| Environment | None.         |

Each one below: what it is, and how it ends up in the
[manifest](/format/).

### Files · a link to a site it knows

The site says which file it is and what its hash is. Here, Modrinth.

<!-- prettier-ignore -->
```js{6-9}
// opys.config.mjs
export default defineConfig({
  plugins: [
    fabric({ version: '1.21.1' }),
    java({ version: '21' }),
    links({
      to: (file) => '${game_directory}/mods/' + file.filename,
      links: ['https://modrinth.com/mod/sodium/version/SMxNOGZ6'],
    }),
  ],
  manifest: {
    command: '@fabric.command',
    args: ['@fabric.jvmArgs', '@fabric.mainClass', '@fabric.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

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

Nobody publishes a hash, so opys downloads the file once while building
and hashes it itself. That is the `sha256` below.

<!-- prettier-ignore -->
```js{6-9}
// opys.config.mjs
export default defineConfig({
  plugins: [
    fabric({ version: '1.21.1' }),
    java({ version: '21' }),
    links({
      to: (file) => '${game_directory}/mods/' + file.filename,
      links: ['https://maven.fabricmc.net/…/fabric-api-0.116.0+1.21.1.jar'],
    }),
  ],
  manifest: {
    command: '@fabric.command',
    args: ['@fabric.jvmArgs', '@fabric.mainClass', '@fabric.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

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

Where the hash comes from:

| Link                    | Hash from                             |
| ----------------------- | ------------------------------------- |
| A GitHub release file   | GitHub's digest for it.               |
| A GitLab package file   | The registry.                         |
| A Modrinth version page | Modrinth.                             |
| A CurseForge file page  | CurseForge.                           |
| Anything else           | opys downloads it once and hashes it. |

**Why the last row matters:** _any_ file can be pinned, not only files on a
host that publishes hashes.

No launch pieces and no variables.

## Good to know

- **`latest` means latest today.** A `releases/latest` link is pinned to
  the release that is newest when you build. Build again to move forward.
- **A page is not a file.** `https://modrinth.com/mod/lithium` is a web
  page, and opys would install that page. Link to a version or a file.
- For a file on your own disk, use [`files`](./files).
