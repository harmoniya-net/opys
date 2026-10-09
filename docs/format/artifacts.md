# Artifacts

An artifact is one file of the installation: where it goes, where it comes
from, how it is checked.

```json
{
  "path": "${library_directory}/org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-linux.jar",
  "source": {
    "url": "https://libraries.minecraft.net/…/lwjgl-3.3.3-natives-linux.jar"
  },
  "size": 110704,
  "integrity": { "sha1": "149070a5480900347071b7074779531f25a6e3dc" },
  "rules": "allow.os.linux",
  "extract": { "into": "${natives_directory}", "clean": true }
}
```

| Field       | Required | What it is                          |
| ----------- | -------- | ----------------------------------- |
| `path`      | yes      | Where the file goes.                |
| `source`    | yes      | Where the bytes come from.          |
| `integrity` | no       | The hash it must have.              |
| `size`      | no       | Size in bytes.                      |
| `rules`     | no       | Which machines get it.              |
| `extract`   | no       | How to unpack it.                   |
| `metadata`  | no       | Anything. The installer ignores it. |

An unknown field is an error. A field a reader does not understand could
change what gets installed.

## In a config

Most artifacts come from plugins. You can also write one by hand. Vanilla
Minecraft, with two files added:

<!-- prettier-ignore -->
```js{12-25}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
    artifacts: [
      // the smallest artifact: where it goes, where from, its hash
      {
        path: '${game_directory}/resourcepacks/pack.zip',
        source: { url: 'https://example.com/pack.zip' },
        integrity: { sha256: 'ce79869e…' },
      },
      // for Windows only, and unpacked after it is downloaded
      {
        path: '${game_directory}/tools/overlay.zip',
        source: { url: 'https://example.com/overlay.zip' },
        integrity: { sha256: '4b1c07aa…' },
        rules: 'allow.os.windows',
        extract: { into: '${game_directory}/tools/overlay' },
      },
    ],
  },
});
```

Where the rest come from:

| In a config                           | Becomes                             |
| ------------------------------------- | ----------------------------------- |
| A loader, `java`                      | Thousands of downloads, pinned.     |
| [`links`](/plugins/links), `modrinth` | One download per link, pinned.      |
| [`files`](/plugins/files)             | One carried file (a blob) per file. |
| `manifest.artifacts`                  | Exactly what you wrote.             |

## path

Where the file is written. It almost always starts with a
[variable](./variables):

```json
"path": "${game_directory}/mods/jei.jar"
```

**Two artifacts, one path:** when a config is built, the later one wins and
the earlier is dropped. A manifest should never hold two.

## source

Where the bytes come from. Exactly one of two forms.

### A download

```json
"source": { "url": "https://example.com/a-1.0.jar" }
```

The URL may contain variables. The installer downloads to `<path>.partial`
and renames it when complete, so a broken download never looks finished.

A failed download is retried three more times, after 0.5, 2 and 8 seconds.

### A carried file

```json
"source": { "blob": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08" }
```

The file travels inside the bundle, at `blobs/<id>`. The id is the sha256
of its content, in lowercase hex.

**No `integrity` needed.** The name is the hash, so a blob is always
verified against its own name.

**When to use which:** a URL for anything published. A blob for a file that
has no public address. In a config you rarely choose by hand:
[`files`](/plugins/files) makes blobs, and
[`links`](/plugins/links) makes downloads.

## integrity

The hash the file must have. One hash, or a list.

```json
"integrity": { "sha256": "ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94" }
```

```json
"integrity": [
  { "sha1": "149070a5480900347071b7074779531f25a6e3dc" },
  { "md5": "d41d8cd98f00b204e9800998ecf8427e" }
]
```

Each entry has one key: `sha1`, `sha256` or `md5`. With a list, matching
any one is enough.

It is used twice:

- **Before downloading.** A file already on disk that matches is kept. One
  that does not is downloaded again.
- **After downloading.** A file that does not match fails the install.

::: warning No hash, no updates
An artifact without `integrity` is never checked. Once its file exists it
is kept as it is, even if the source changed. Always give a hash.
:::

## size

The size in bytes. It drives the progress bar and the download order. It is
not checked against the file. That is what `integrity` is for.

## rules

Which machines this file is for. Absent means all of them.

```json
"rules": "allow.os.windows"
```

Used for natives, per-platform JDKs, and mods that only work on some
systems. Everything about the syntax is on [Rules](./rules).

## extract

What to unpack once the file is in place. One step, or a list of steps run
in order.

The archive type comes from the file name: `.tar`, `.tar.gz` and `.tgz` are
tar. Anything else is read as zip (a `.jar` is a zip).

There are three kinds of step. Which one you get depends on the fields
present.

### Dump: the whole archive

```json
{ "into": "${natives_directory}", "clean": true, "excludes": ["META-INF/"] }
```

| Field      | What it does                          |
| ---------- | ------------------------------------- |
| `into`     | The folder to unpack into. Required.  |
| `clean`    | `true` empties `into` first.          |
| `includes` | Only these entries.                   |
| `excludes` | Skip these. Default: `["META-INF/"]`. |

**Used for:** native libraries, modpack overrides.

### Scan: entries that match

```json
{ "matches": "*", "into": "${java_runtime_dir}/jdk-21", "strip": ["*/"] }
```

| Field      | What it does                                   |
| ---------- | ---------------------------------------------- |
| `matches`  | Which entries to take. Required.               |
| `into`     | The folder to unpack into. Required.           |
| `includes` | More patterns. An entry matching any is taken. |
| `excludes` | Skip these.                                    |
| `strip`    | Remove a leading part of each entry's name.    |

`strip: ["*/"]` drops the archive's top-level folder, whatever it is
called. A JDK archive's top folder carries a build number, so this is how
the `java` plugin unpacks one.

**Used for:** an archive with a wrapper folder you do not want.

### Pick: one file

```json
{ "file": "LICENSE", "into": "${game_directory}/LICENSE.txt" }
```

Takes the entry named exactly `file` and writes it to the file `into`. A
missing entry fails the install.

**Used for:** one binary out of a release archive.

### Entry patterns

`matches`, `includes` and `excludes` use a deliberately small syntax:

| Pattern           | Matches                    |
| ----------------- | -------------------------- |
| `lib/` or `lib/*` | Names starting with `lib/` |
| `lib*`            | Names starting with `lib`  |
| `*.so`            | Names ending with `.so`    |
| `*`               | Everything                 |
| anything else     | That exact name            |

This is not the glob syntax of [cleanup](./cleanup). Patterns here are not
substituted with variables. `into` is.

### Good to know

- Unpacking runs on **every** install, so unpacked files always match the
  manifest.
- Symbolic links and executable bits are kept from a tar, on Unix. A zip
  entry's mode is ignored.
- An entry that would land outside `into` (an absolute name, a `..`) stops
  the install. An archive is somebody else's file.
- With `clean: true`, keep the archive itself outside `into`.

## metadata

Any JSON value. The installer never reads it. Plugins use it for notes of
their own.
