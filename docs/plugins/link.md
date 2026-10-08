# links

`links()` takes URLs you already have, a mod on Modrinth or a release asset on
GitHub for example, and turns each one into a pinned file in your manifest. You
paste the link. opys finds the file's size and hash when you build, so the
installer never has to look anything up. It comes from `@opys/link`, and is
re-exported by `@opys/minecraft`.

Use it for files that someone else publishes. For a file on your own disk, use
[`files`](./files).

## Signature

```ts
function links(options: LinksPluginOptions): ChainablePlugin;

interface LinksPluginOptions extends LinkOptions {
  links: string[];
  path: (file: ResolvedFile) => string;
}
```

`links()` returns a plugin, so it goes in `plugins` like any other, and the
fluent methods such as `.exclude()` work on it.

## Options

| Name              | Type               | Default                   | Meaning                                                                                                                      |
| ----------------- | ------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `links`           | `string[]`         | required                  | The links to resolve, in order.                                                                                              |
| `path`            | `(file) => string` | required                  | Where each resolved file is installed. Called once per file. May contain install-time variables such as `${game_directory}`. |
| `githubToken`     | `string`           | none                      | Sent with the requests to GitHub's API when the build looks a release up. It raises the rate limit.                          |
| `gitlabToken`     | `string`           | none                      | Sent with the requests to GitLab's API when the build looks a package file up, and when it downloads one to hash it.         |
| `curseforgeToken` | `string`           | none                      | Required for any CurseForge link. CurseForge has no anonymous API.                                                           |
| `githubApi`       | `string`           | the public GitHub API     | GitHub API base, for a server that is not the public one.                                                                    |
| `modrinthApi`     | `string`           | the public Modrinth API   | Modrinth API base, for a server that is not the public one.                                                                  |
| `curseforgeApi`   | `string`           | the public CurseForge API | CurseForge API base, for a server that is not the public one.                                                                |

The `path` function receives a `ResolvedFile`:

| Field       | Meaning                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| `link`      | The link as you wrote it.                                                                                    |
| `provider`  | `'github'`, `'gitlab'`, `'modrinth'`, `'curseforge'` or `'url'`.                                             |
| `filename`  | The file's name. For a plain URL, the last path segment, decoded, or the host if the URL has no path.        |
| `url`       | Where the file is downloaded from. This can differ from `link`.                                              |
| `size`      | The file's size in bytes.                                                                                    |
| `integrity` | The hash, as `{ sha256 }` or `{ sha1 }`. Absent only when Modrinth or CurseForge lists no sha1 for the file. |

## Links you can paste

opys reads each link by its host and path. Nothing is fetched to decide what
a link is. A link that matches none of the shapes below is taken as the file
itself. A string that is not an `http://` or `https://` URL stops the build.

| Link shape                                                                         | Provider     | Where the hash comes from                                                                                                               |
| ---------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `github.com/<owner>/<repo>/releases/download/<tag>/<asset>`                        | `github`     | GitHub's digest for the asset. A release with no digest is downloaded and hashed.                                                       |
| `github.com/<owner>/<repo>/releases/latest/download/<asset>`                       | `github`     | The same, on the newest release that is neither a draft nor a prerelease and has the asset. Only the 100 newest releases are looked at. |
| `<any host>/api/v4/projects/<project>/packages/generic/<package>/<version>/<file>` | `gitlab`     | The package registry's `file_sha256`. Downloaded and hashed in the rare case it is missing.                                             |
| `modrinth.com/…/version/<id>`                                                      | `modrinth`   | Modrinth's sha1 for the version's primary file.                                                                                         |
| `curseforge.com/…/files/<id>`                                                      | `curseforge` | CurseForge's sha1, when it publishes one. Needs `curseforgeToken`.                                                                      |
| Any other `http://` or `https://` URL                                              | `url`        | Nothing is published, so the file is downloaded once at build time and hashed (sha256).                                                 |

Notes on the shapes:

- A GitHub link must be exactly one of the two forms above. A repository page
  or a `releases/tag/…` page is not a file, so it falls through to the last row.
- The GitLab shape is recognised on any host, so a self-hosted GitLab works.
  The project can be a path such as `group/name` or a numeric id.
- `www.` is ignored, so `www.curseforge.com` and `curseforge.com` are the same.
- Tokens are used when you build and are never written into the manifest. The
  installer downloads each `url` without one, so a file that needs a token to
  download cannot be installed, even though the build could look it up.

::: warning A page is not a file
A link that matches no shape is downloaded, and whatever comes back is pinned.
A Modrinth project page, such as `https://modrinth.com/mod/sodium`, has no
`/version/` segment, so it is not read as a version. It is downloaded as HTML
and that HTML is the file. Link to the version, as in
`https://modrinth.com/mod/sodium/version/<id>`, or the file's own address.
:::

## Behaviour

- **Resolved at build time.** Every link is looked up, and every resolved file
  is pinned, when you run `opys build`. The manifest carries the size, the URL
  and the hash. The installing machine never resolves a link.
- **A `latest` link is pinned to the release it meant that day.** Rebuild the
  manifest to follow a newer release.
- **All or nothing.** If one link fails, the build stops. There is no partial
  result, so a manifest is never missing a file without saying so.
- **Modrinth and CurseForge links are batched.** Each provider is asked once for
  all of its links, however they are interleaved in `links`. The other providers
  are asked one link at a time.
- **Order is kept.** Files appear in the manifest in the order you listed them.
- **One `path` for every link.** The function is the same for each file in one
  `links()` call. To send some files to a different folder, branch on
  `file.provider`, or on `file.link`, inside the function, or use a second
  `links()` call for that folder.

A CurseForge link without `curseforgeToken` is an error that names the link.
A GitHub tag that cannot be found is an error. So is a tagged release that has
no asset of the name you gave, and that error lists up to eight assets the
release does have, so a misspelt name is easy to spot.

A `latest` link whose asset no stable release carries fails with
`No stable GitHub release in <owner>/<repo> matching the loader filter`. The
message says "loader" although no loader is involved, and it does not list
assets.

## Example

This pack builds a Fabric 1.21.1 installation with Sodium from Modrinth and
Fabric API from its Maven repository. The second link is a plain URL, so opys
downloads it once and hashes it.

<<< @/examples/plugin-files-link/opys.config.mjs

Build it with:

```sh
opys build
```

The config above needs no token. The next snippet shows a GitHub release asset
and a CurseForge file, which needs your API key to build. Each is in its own
`links()` call so that they can have different folders. It goes in the
`plugins` list in place of the `links()` call above:

```js
plugins: [
  fabric('1.21.1'),
  java('21'),
  links({
    path: (file) => '${game_directory}/resourcepacks/' + file.filename,
    links: [
      'https://github.com/owner/repo/releases/download/v1.2.0/pack.zip',
    ],
    githubToken: process.env.GITHUB_TOKEN,
  }),
  links({
    path: (file) => '${game_directory}/mods/' + file.filename,
    links: [
      'https://www.curseforge.com/minecraft/mc-mods/<slug>/files/6717445',
    ],
    curseforgeToken: process.env.CURSEFORGE_TOKEN,
  }),
],
```

`owner/repo`, `pack.zip` and `<slug>` are placeholders. Replace the first two
with a real release. For the CurseForge link, opys reads only the number after
`/files/`, so use the address of the file's page.

The mod plugins `modrinth` and `curseforge` do the same job for their own
sites, and take a version or file id rather than a link. Read
[Mods and files](/guide/mods) for when each one is the better choice.

## When to use `files` instead

Use `links` when the file is already published and you have its address.
`links` pins the hash the publisher gives, or hashes the file once if nobody
does. Use [`files`](./files) when the file is on your disk. Then nothing is
published, and the file is carried in the bundle or hosted by you.
