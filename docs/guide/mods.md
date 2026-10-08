# Mods and files

This page covers how mods and other files get into a pack. There are four
ways, and each one ends in the same place: an artifact in the manifest, pinned
by hash. Read [Concepts](./concepts) first if "artifact", "blob" or "bundle"
are new to you.

## Choosing a source

| Source       | Use it when                                                                                                                       | Where the bytes come from                                | Plugin                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------- |
| `modrinth`   | The mod is on Modrinth and you know its version                                                                                   | Modrinth's CDN; hash from Modrinth's API                 | [modrinth](/plugins/modrinth)     |
| `curseforge` | The mod is on CurseForge                                                                                                          | CurseForge's CDN; needs an API token                     | [curseforge](/plugins/curseforge) |
| `links`      | You have a URL: a GitHub or GitLab release file, a Modrinth version or CurseForge file page, or any address a file is served from | Wherever the link points                                 | [links](/plugins/link)            |
| `files`      | The file is on your disk: a private mod, a generated config                                                                       | Carried inside the bundle, or hosted at a `url` you give | [files](/plugins/files)           |

The first three name a file that someone else publishes. `files` takes a file
you have. Where a mod exists on a platform, prefer the platform's plugin: its
hash comes from the platform, and you do not have to find it yourself. Use
`links` for a one-off URL, and `files` for anything that is not published at
all.

To install a whole modpack rather than single mods, use `modrinthModpack` or
`curseforgeModpack`. They are described on the [modrinth](/plugins/modrinth) and
[curseforge](/plugins/curseforge) pages.

## Modrinth

Name each mod by its version, either as a version ID or as the version's page
URL. The ID is the segment after `/version/` in that URL, as in
`https://modrinth.com/mod/sodium/version/JjCVwmVA`. opys sends that segment to
Modrinth as an ID, so a URL that carries a version number instead, such as
`…/version/mc1.21.1-0.8.12-beta.2-fabric`, fails the build with an `HTTP 400`.
This config builds a Fabric pack with two mods from Modrinth:

<<< @/examples/mods-modrinth/opys.config.mjs

Each version contributes its primary file, or its first file when none is
marked primary. The `modrinth` plugin needs no token: Modrinth's API is open.

opys takes each version as you name it. It does not check the version against
your loader or your Minecraft version, so the version you choose has to match
the pack. The example above uses 1.21.1 versions for `fabric('1.21.1')`.

## CurseForge

`curseforge` takes numeric file IDs, or a file's CurseForge URL. It needs an
API key from [the CurseForge console](https://console.curseforge.com/), passed
as `token`. Read the key from the environment rather than writing it into the
config, so the config can be committed:

```js
curseforge({
  token: process.env.CURSEFORGE_TOKEN,
  path: (file) => `\${game_directory}/mods/${file.filename}`,
  files: [
    6717445, // a file id, or the file's CurseForge URL
  ],
}),
```

Add it to `plugins` beside a loader and `java`, as in the Modrinth example. Run
the build with the key set in your shell:

```sh
CURSEFORGE_TOKEN=your-key opys build
```

The key is used at build time only. The URLs it resolves to are public, so a
built bundle installs without one. The plugin's own page lists every option.

## Links

`links` takes a URL and turns it into a pinned file. You can paste the link
you already have. Each link is resolved when you build, and the hash is
recorded in the manifest:

| Link                                                                                                           | Hash comes from                                                                                      |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `github.com/<owner>/<repo>/releases/download/<tag>/<asset>`                                                    | The digest GitHub lists for the asset. For an asset with none, opys downloads the file and hashes it |
| `github.com/<owner>/<repo>/releases/latest/download/<asset>`                                                   | The same, on the newest release that is not a prerelease and has the asset                           |
| `<host>/api/v4/projects/<project>/packages/generic/<package>/<version>/<file>`, a GitLab package registry file | The sha256 the registry reports                                                                      |
| `modrinth.com/…/version/<id>`                                                                                  | Modrinth's sha1                                                                                      |
| `curseforge.com/…/files/<id>`                                                                                  | CurseForge's sha1. Needs `curseforgeToken`                                                           |
| Any other URL                                                                                                  | Downloaded once at build time, then hashed                                                           |

Add `links` to `plugins` the way you add `modrinth`:

```js
links({
  path: (file) => `\${game_directory}/mods/${file.filename}`,
  links: [
    'https://modrinth.com/mod/sodium/version/JjCVwmVA',
    'https://github.com/owner/repo/releases/latest/download/mod.jar',
    'https://example.com/files/custom-mod.jar',
  ],
  curseforgeToken: process.env.CURSEFORGE_TOKEN,
}),
```

The second and third links are placeholders; give `links` addresses of files
that exist.

A `latest` link is pinned to whichever release is latest when you build. It
does not follow the release later. Rebuild the bundle to move to a newer one.

::: warning A page is not a file
A Modrinth or CurseForge address that does not name a version or file, such as
`https://modrinth.com/mod/lithium`, is treated as any other URL. opys downloads
whatever is at that address, which here is the project's web page, hashes it and
installs it under that name. Paste the link to a specific version or file.
:::

Tokens are optional, except for CurseForge links. `githubToken` raises GitHub's
rate limit and reaches private repositories. `gitlabToken` reaches private
GitLab projects.

## Files on your disk

`files` takes a directory on the build machine and makes an artifact for each
regular file under it, however deep; a symbolic link is not followed. `from` is
relative to the config file. `files` is exported by `@opys/dev`, not by
`@opys/minecraft`. There are two shapes, and the one you get depends on whether
you give a `url`.

**Carried in the bundle.** Without a `url`, each file is stored in the bundle
as a blob, named by the sha256 of its contents:

```js
files({ from: 'mods', to: '${game_directory}/mods/${rel}' });
```

`opys build` writes the blobs into the bundle. `opys launch` reads them from
where they are, without copying them first. Nothing has to be hosted for these
files to install.

**Pointed at a URL you host.** With a `url`, the bundle carries no copy. Each
artifact points at the file at that address, pinned by its hash. You upload
the files yourself:

```js
files({
  from: 'mods',
  to: '${game_directory}/mods/${rel}',
  url: 'https://cdn.example/${rel}',
  hash: 'sha256', // optional; sha1 is the default
});
```

Every file is hashed, whether or not you name a hash, so a changed file is
fetched again. Use the carried form unless you want the files hosted separately
from the bundle.

### Placing files with `to` and `url`

For `files`, `to` says where each file goes and `url` says where its copy is.
Each takes either a template string or a function of the file.

As a template string, these placeholders are filled in for each file:

| Variable      | Value                                                            |
| ------------- | ---------------------------------------------------------------- |
| `${rel}`      | The path relative to `from`, with `/` separators                 |
| `${dir}`      | The directory part of `${rel}`. Empty for files at the top level |
| `${filename}` | The last segment of the path                                     |

Any other `${name}` is left alone for install time, so `${game_directory}` and
`${root}` work in a `to` template. See [Variables](/launcher/vars) for the full
list.

::: warning Give `to` a variable
Without `to`, a file's path is its `${rel}` alone, such as `settings.txt`, with
no variable in front of it. Nothing anchors that path to the game, so it is
relative to wherever the installer runs. Start `to` with `${game_directory}` or
`${root}`.
:::

As a function, you get the same three fields and also `abs`, the file's full
path on the build machine, and `size`, its size in bytes. A function can decide
the place for each file in any way you need:

```js
files({
  from: 'mods',
  to: (file) => `\${game_directory}/mods/${file.filename}`,
});
```

`files` returns a plugin you can narrow with the fluent methods from
`@opys/dev`, for example `.exclude(...)`. See [files](/plugins/files) for the
full list of options.

### Placing mods with `path`

`modrinth`, `curseforge` and `links` take a `path` function instead of a
template. It is called once for each file opys resolved, and returns where the
file goes. It may use install-time variables such as `${game_directory}`, the
same way a `to` template does.

What the function receives:

| Plugin       | Fields                                                        |
| ------------ | ------------------------------------------------------------- |
| `modrinth`   | `filename`, `versionId`, `projectId`, `versionNumber`, `size` |
| `curseforge` | `filename`, `fileId`, `projectId`, `size`                     |
| `links`      | `link`, `provider`, `filename`, `url`, `size`, `integrity`    |

Each plugin takes one `path`. To put files in a second folder, such as a
resource pack folder, add a second instance of the plugin with its own
`path`.

## Pinned at build time

Every file a pack uses is pinned by hash when you build, and the launch never
looks anything up. The hash comes from the platform where one is published, and
from opys reading the file where none is. A `latest` link is resolved the same
way. The bundle says which bytes to install, not where to find the latest.

The result is that an installation can only contain the files you built. It
also means you cannot update a mod by changing the pack on the player's machine.
To update:

1. Change the version ID, the link or the file in your project.
2. Run `opys build` again. That writes a new bundle.
3. Publish the new bundle. See [Publishing a bundle](./publishing).

::: warning
Players keep the mods from the bundle they installed until they install a new
one. Rebuilding changes your copy, not theirs.
:::

For more detail on each plugin, see its page: [modrinth](/plugins/modrinth),
[curseforge](/plugins/curseforge), [links](/plugins/link) and
[files](/plugins/files).
