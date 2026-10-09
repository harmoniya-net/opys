# The bundle file

A bundle is how a manifest is stored: a zip with a fixed layout. This page
is that layout, for anyone reading or writing one without opys.

For what a bundle is _for_, see [The bundle](/basics/bundle).

## Entries

| Entry            | Contains                                         |
| ---------------- | ------------------------------------------------ |
| `opys.json`      | The **head**: what the bundle says about itself. |
| `manifest.json`  | The [manifest](./), whole.                       |
| `blobs/<sha256>` | One entry per carried file.                      |

```sh
unzip -l game.opys
unzip -p game.opys opys.json
unzip -p game.opys manifest.json | jq '.launch'
```

**Why two JSON files:** they describe different things. The manifest
describes the installation, and is megabytes, one entry per installed file.
The head describes the bundle, and is a few bytes. Today it holds only
`format`.

Find entries by name. Do not rely on their order.

## format

```json
{ "format": 1 }
```

The version of the format, in the head. It is `1`.

A reader must:

- Read `format` **first**.
- Refuse the bundle if it is not the integer `1`. Missing, `"1"` and `1.0`
  are all refused.
- Do so before reading `manifest.json`.

**Why first:** another format may spell the manifest differently. A reader
that guesses could install the wrong thing.

A reader ignores any other field of the head.

**Any other number is refused**, a lower one as much as a higher. opys reads
one format. There is no migration and no compatibility mode. When the
format changes, a bundle is rebuilt from its config with `opys build`.

For a launcher this means: update the runtime and republish the bundles
together.

## Blobs

A blob is a file carried in the bundle. An artifact names it by the sha256
of its content:

```json
{
  "path": "${game_directory}/config/pack.toml",
  "source": { "blob": "f727f7b2…" }
}
```

Its bytes are the entry `blobs/f727f7b2…`. The id is 64 lowercase hex
digits.

A reader must:

- Refuse a bundle that names a blob it does not contain, **before
  installing anything**.
- Check each blob against its name when installing it.

A writer must not store bytes under a name they do not hash to. The same
blob used by two artifacts is stored once.

## What opys writes

These are how the reference writer behaves. A reader should not depend on
them.

- `opys.json` first and uncompressed, so it can be read from the front of
  the file. The rest is deflated.
- Blobs in order of their id.
- Fixed timestamps, so the same manifest always gives the same entries.
- No other entries. A reader ignores any it does not know.

## Reading one

```text
open the zip
head = json(entry "opys.json")
if head.format != 1: refuse
manifest = json(entry "manifest.json")
for each artifact with source.blob:
    if no entry "blobs/" + id: refuse
```

Then, when installing an artifact with a blob: copy the entry to its
`path`, and refuse it if its sha256 is not the id.

## The file name

By convention `<name>.opys`. Nothing in the format depends on it.
