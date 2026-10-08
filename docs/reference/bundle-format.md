# Bundle

This page is the byte-level layout of a bundle: the file `opys build` writes
and a launcher installs from. It is for anyone writing a reader or a writer
in a language other than TypeScript or Rust. What the two JSON entries
contain is the [manifest](/reference/manifest)'s business; this page says how
they are packed.

A bundle is a zip file. Nothing in it is specific to opys: `unzip` opens it,
and so does any zip library.

Two kinds of statement appear below. "A reader must" and "a writer must" are
requirements of the format: a bundle or an implementation that breaks them is
wrong. "The reference reader" and "the reference writer" describe what the
Rust implementation does, which another implementation may match or improve
on. Where a page of this site says "the reference", it means the same thing.

## Entries

A bundle holds three kinds of entry:

| Entry            | Compression   | Contents                                          |
| ---------------- | ------------- | ------------------------------------------------- |
| `opys.json`      | stored (none) | The head: `format`, `vars`, `launch`, `restrict`. |
| `artifacts.json` | deflate       | The artifact list: a JSON array.                  |
| `blobs/<sha256>` | deflate       | One entry per blob the manifest names.            |

The compression column is what the reference writer does. The reference
reader opens every entry through the zip directory, so it accepts either
method for any entry.

`<sha256>` is the blob's id: 64 lowercase hexadecimal digits, the sha256 of
the bytes the entry holds. The reference writer writes no other entries, and
the reference reader ignores any it finds.

The head and the list are split because they are read for different reasons
and differ in size. The list has one line per file of an installation and
runs to megabytes (about 1.3 MB for the vanilla example); only an installer
reads it. The head is a small file (about 24 KB for the vanilla example) and
is what anything else asks about, such as which version a bundle is or which
variables it leaves open. So the reference writer puts the head first and
stores it uncompressed. A reader can take it off the front of the file without
parsing the zip directory, and a tool can read the whole head with one seek.

A `blobs/` entry is written only for a blob that some artifact names. The
same blob named by two artifacts is written once.

## Entry order

The reference writer writes the entries in this order:

1. `opys.json`
2. `artifacts.json`
3. `blobs/<id>` for each distinct blob id, in ascending order of the id as a
   string

The format does not fix the order. A reader must find entries by name and must
not depend on their order; the reference reader reads a bundle with the head
last without trouble. The head is first only so that it can be read off the
front of the file, as [Reading the head alone](#reading-the-head-alone)
shows.

## The head

`opys.json` is a JSON object. Its fields:

| Field      | Written when                    | Meaning                                                |
| ---------- | ------------------------------- | ------------------------------------------------------ |
| `format`   | always                          | An integer. See [The format field](#the-format-field). |
| `vars`     | always                          | An object of variable definitions. Empty is `{}`.      |
| `launch`   | the manifest has a launch block | The launch command.                                    |
| `restrict` | the list is not empty           | A list of strings.                                     |

A writer omits `launch` when there is none and omits `restrict` when it is
absent or empty. A reader treats an absent `vars` as `{}`, and an absent
`launch` or `restrict` as not there.

The reference writer indents the head and writes the artifact list compactly.
A reader must parse both as JSON and not depend on whitespace.

## The format field

`format` is the version of the bundle format. This version is `1`. The
reference implementation reads and writes `1` and nothing else.

A reader must:

- read `format` before it reads anything else in the head;
- refuse the bundle if `format` is not the integer `1`, including when it is
  absent, is not an integer, or is a string such as `"1"`. The reference
  reader also refuses `1.0`;
- refuse it before it interprets `vars`, `launch`, `restrict`, or the
  artifact list. A later format may spell those in a way that does not parse
  as version 1.

The reference reader reports a wrong number as an unknown format and a missing
or mistyped `format` as a parse error. Both refuse the bundle.

A reader does not refuse a bundle on the file name or extension. See
[The file name](#the-file-name).

The reference reader ignores head fields it does not know. It does not ignore
an unknown `format`.

## Blobs

A blob is a file the manifest carries inside the bundle. An artifact names one
with `"source": { "blob": "<id>" }` instead of a URL. The id is the sha256 of
the file's bytes, and it is the only name a blob has. Its location in the
bundle is `blobs/<id>`.

The id is also the integrity check. A blob artifact has no `integrity` of its
own: the id is the expected sha256 of the bytes. A reader that installs the
artifact verifies the bytes it reads against the id.

A blob id in a manifest must be 64 characters from `0`-`9` and `a`-`f`.
Anything else is not a blob id, and the reference implementation refuses the
manifest.

The reference reader does not hash a blob's bytes when it opens the bundle or
when it copies one out. It checks that the entry exists. The install step
checks the hash as it verifies each artifact, unless the caller has turned
that check off.

### Refusing a bundle

A reader must refuse a bundle whose manifest names a blob the bundle does not
hold, and must do so before it installs anything from it. The check is that
the zip has an entry named `blobs/<id>` for every blob id that an artifact's
`source` names.

The reference reader does this check when it opens the bundle, so a missing
blob is found before the first download or copy. Reading only the head does
not make the check, since it never reads the artifact list.

A writer must not write a blob whose bytes do not hash to its name. The
reference writer hashes each blob as it copies it into the zip and refuses the
bundle if the hash differs.

## Determinism

The reference writer produces the same bytes for the same manifest and blobs:

- every entry has the timestamp 1980-01-01 00:00:00, which is the zip default
  and not the time of the build;
- every entry has the Unix mode `0644`;
- entries are written in the order above.

Nothing in reading depends on this. Two bundles of the same manifest differ
only if their manifests or blobs differ. A deflated entry's compressed bytes
depend on the deflate implementation, so compare two bundles by their entries'
content, not by the zip file's bytes.

## Zip details

These describe the reference writer.

- An entry of 4 GiB or more is written with Zip64, so a reader that is to open
  one must support Zip64.
- It sets no archive comment and no encryption, and writes no data
  descriptors: each entry's sizes and CRC are in its local header.
- Names are the entry names above, with `/` as the separator. It writes no
  directory entries.

## Reading a bundle

A reader that wants the whole manifest:

```text
open the file as a zip
for name in ["opys.json", "artifacts.json"]:
    if the zip has no entry name: refuse ("not a bundle")
head = parse_json(read(zip, "opys.json"))
if head.format is not the integer 1: refuse ("unknown format")
vars      = head.vars or {}
launch    = head.launch          (absent is fine)
restrict  = head.restrict        (absent is fine)
artifacts = parse_json(read(zip, "artifacts.json"))
for each artifact whose source has a "blob" field:
    id = source.blob
    if id is not 64 lowercase hex digits: refuse
    if the zip has no entry "blobs/" + id: refuse ("names a blob nothing holds")
return the manifest

later, when installing the artifact that names blob id:
    copy entry "blobs/" + id to the artifact's path
    if the sha256 of the copied bytes is not id: refuse (the bundle is corrupt)
```

The reference reader's `parse` step checks `format` first and only then
parses the rest of the head, for the reason given in
[The format field](#the-format-field).

## Reading the head alone

The head is the first entry of a bundle the reference writer wrote, so the zip
directory is not needed to read it. Check each field before you rely on it.

```text
read 30 bytes at offset 0
if they do not start with the local file header signature 50 4b 03 04: refuse
method   = bytes 8-9   (little-endian u16); must be 0 (stored)
flags    = bytes 6-7   (little-endian u16); bit 0x0008 must be clear
csize    = bytes 18-21 (little-endian u32); the stored size
name_len = bytes 26-27 (little-endian u16)
extra    = bytes 28-29 (little-endian u16)
name     = the name_len bytes after offset 30; must be "opys.json"
data     = csize bytes starting at offset 30 + name_len + extra
parse data as JSON and check format, as above
```

If any of those checks fails, read the zip directory instead and look the
entry up by name. A bundle from another writer may use a data descriptor, a
compressed head, or an extra field this sketch does not account for.

The reference implementation reads the head through the zip directory, so it
costs the directory and the head, whatever the bundle weighs. Either way, the
artifact list is never read.

## A session with unzip

This script writes a small bundle: one blob, one download, and a launch
command. The blob is the five bytes `hello`.

```js
import { blobBytes, blobId, decodeManifest, writeBundle } from '@opys/core';

const hello = Buffer.from('hello');
const id = blobId(hello);

const manifest = decodeManifest({
  vars: { root: '/srv/game' },
  artifacts: [
    { path: '${root}/config/hello.txt', source: { blob: id }, size: 5 },
    {
      path: '${root}/libraries/a/a-1.0.jar',
      source: { url: 'https://example.com/a-1.0.jar' },
      integrity: { sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709' },
    },
  ],
  launch: {
    command: '/usr/bin/java',
    workdir: '${root}',
    args: ['-cp', '${root}/libraries/a/a-1.0.jar', 'com.example.Main'],
  },
});

await writeBundle('out.opys', manifest, { [id]: blobBytes(hello) });
```

List it:

```sh
unzip -lv out.opys
```

```text
Archive:  out.opys
 Length   Method    Size  Cmpr    Date    Time   CRC-32   Name
--------  ------  ------- ---- ---------- ----- --------  ----
     248  Stored      248   0% 01-01-1980 00:00 d7474483  opys.json
     285  Defl:N      201  30% 01-01-1980 00:00 cf6b63d1  artifacts.json
       5  Defl:N        7 -40% 01-01-1980 00:00 3610a686  blobs/2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
--------          -------  ---                            -------
     538              456  15%                            3 files
```

Read the head, and only the head:

```sh
unzip -p out.opys opys.json | head -4
```

```text
{
  "format": 1,
  "vars": {
    "root": "/srv/game"
```

Copy one blob out and check it against its name:

```sh
unzip -p out.opys blobs/2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824 \
  | sha256sum
```

```text
2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824  -
```

Check the zip's own CRCs:

```sh
unzip -t out.opys | tail -1
```

```text
No errors detected in compressed data of out.opys.
```

`unzip -t` checks the zip's CRCs. It does not check the blob names. The
`sha256sum` line above is the check that does.

## The file name

By convention a bundle is named `<name>.opys`. The config's `output` field
names the file `opys build` writes, and the examples use `game.opys`. Nothing
in the format depends on the extension, and the reference reader opens a
bundle under any name. A launcher may use the extension to decide what to
open; the format itself does not.

## Related

- [The manifest](/reference/manifest) describes what `opys.json` and
  `artifacts.json` contain.
- [Concepts](/guide/concepts) explains the manifest, the bundle and the two
  machines a bundle travels between.
- [Embedding the runtime](/launcher/embedding) shows how a launcher installs
  from a bundle.
