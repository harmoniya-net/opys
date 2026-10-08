# files

`files()` takes a directory on your build machine and makes an artifact for
every file in it. Use it for what you have on disk: a private mod, a config
you generated, a folder of server settings. It comes from `@opys/dev`.

By default the files are carried inside the bundle, so nothing has to be
hosted. Give it a `url` and the bundle points at copies you host instead.

## Signature

```ts
function files(options: FilesOptions): ChainablePlugin;

type FilesOptions = EmbeddedFiles | PublishedFiles;

type FileTemplate = string | ((file: LocalFile) => string);

interface LocalFile {
  readonly rel: string; // path relative to `from`, with `/` separators
  readonly dir: string; // directory part of `rel`; '' at the top level
  readonly filename: string; // last path segment
  readonly abs: string; // absolute path on the build machine
  readonly size: number; // size on disk, in bytes
}
```

`EmbeddedFiles` is the form without a `url`. `PublishedFiles` is the form
with one. The two are told apart by which field you give, and `hash` is only
allowed with `url`.

## Options

| Name   | Type                 | Default  | Meaning                                                                                                                               |
| ------ | -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `from` | `string`             | required | The directory to take files from. A relative path is resolved against the config file's directory. An absolute path is used as it is. |
| `to`   | `FileTemplate`       | `${rel}` | Where each file is installed. A template string or a function of the file.                                                            |
| `url`  | `FileTemplate`       | none     | Where each file's copy is hosted. Giving it makes the files pointed at rather than carried.                                           |
| `hash` | `'sha1' \| 'sha256'` | `'sha1'` | The hash each pointed-at file is pinned with. Only with `url`.                                                                        |

A template string can use three placeholders, filled in for each file:

| Placeholder   | Value                                                              |
| ------------- | ------------------------------------------------------------------ |
| `${rel}`      | The path relative to `from`. The default for `to`.                 |
| `${dir}`      | The directory part of `${rel}`. Empty for a file at the top level. |
| `${filename}` | The last segment of the path.                                      |

Any other `${name}` is left as it is, to be filled in when the game is
installed. So `${game_directory}` and `${root}` work in `to` and `url`.

A function receives the whole `LocalFile`: `rel`, `dir` and `filename`, which
are the placeholders' values, and also `abs` and `size`. Only the function form
gets `abs`, so the template form cannot use the build machine's path.

## Behaviour

**Carried.** Without a `url`, each file becomes a blob. The blob's name is the
sha256 of its contents, and the bytes are written into the bundle at
`opys build`. The artifact names the blob and its size, and has no hash of its
own, since the name is the hash. `opys launch` reads the bytes from where they
are on disk, so nothing is copied first.

**Pointed at.** With a `url`, each artifact gets that address as its source,
and the file's size and hash. The file is hashed at build time, with sha1 unless
you set `hash`, so a changed file has a new hash. opys does not upload
anything. You put the copies at the addresses you named.

**Every file under `from`.** The walk is recursive and takes regular files
only. A symbolic link is not followed, so a link out of the directory cannot
pull in the rest of the disk. The result is sorted by `rel`, so two builds of
the same tree give the same manifest. An empty directory gives no artifacts
and no error.

**Placement.** `to` decides where each file goes, and it is evaluated for every
file. A file at the top level has `${dir}` empty, so `${dir}/${filename}`
starts with a slash. Use `${rel}` for a path that does not depend on depth.

::: warning
Without `to`, a file's artifact path is its bare relative path, such as
`settings.txt`, with no variable in front of it. Give `to` a variable such as
`${game_directory}` so the file lands where the game reads it.
:::

**Errors.** A `from` that is missing or is not a directory, a directory that
cannot be read, or a file that cannot be opened or read while it is hashed,
stops the build. The error names the path.

**Chaining.** `files()` returns a plugin, so the fluent methods work on it.
`.exclude(...)` drops matching artifacts. See [`@opys/dev`](./dev) for the
rest.

## Example

This pack carries a folder of configs in the bundle. The folder is
`config/` next to the config file, and it holds two text files, one of them in
a subfolder:

```
config/
  settings.txt
  extra/
    tuning.txt
```

<<< @/examples/plugin-files-files/opys.config.mjs

The `to` template keeps the folder structure: `extra/tuning.txt` is installed
at `${game_directory}/config/extra/tuning.txt`. Building it writes the two
files into the bundle as blobs, and the bundle has no URL for either of them.

Build it with:

```sh
opys build
```

A pointed-at folder of mods looks different, because it needs a URL that you
host. This one pins with SHA-256 and uses a function for `to`:

```js
files({
  from: 'mods',
  to: (file) => `\${game_directory}/mods/${file.filename}`,
  url: 'https://cdn.example.com/my-pack/mods/${rel}',
  hash: 'sha256',
}),
```

`cdn.example.com` is a placeholder. The `url` template is evaluated the same
way as `to`. Upload each file to the address it produces before players
install.

## When to use `links` instead

Use [`links`](./link) when the file is already published, on GitHub, Modrinth,
CurseForge or any other address, and you have its URL. `links` takes the hash
from the publisher or computes it once. Use `files` when the file exists only on
your disk. For how mods and other files fit together, see
[Mods and files](/guide/mods).
