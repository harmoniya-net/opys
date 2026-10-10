# @opys/bundle

[![npm](https://img.shields.io/npm/v/@opys/bundle.svg)](https://www.npmjs.com/package/@opys/bundle)

The `.opys` file: a manifest and the files it carries, as one zip.
`@opys/bundle` writes one and reads one back. The manifest inside is
[`@opys/core`](https://www.npmjs.com/package/@opys/core)'s.

```sh
npm install @opys/bundle
```

## Example

Write a bundle, then read it back.

```js
import {
  blobFile,
  hashBlobFile,
  readBundle,
  readBundleHead,
  writeBundle,
} from '@opys/bundle';

// a carried file is named by the sha256 of its content
const { id, size } = await hashBlobFile('./server.properties');

const manifest = {
  vars: { root: '/games/pack' },
  artifacts: [
    { path: '${root}/server.properties', source: { blob: id }, size },
    {
      path: '${root}/libs/a.jar',
      source: { url: 'https://example.com/a.jar' },
      integrity: { sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709' },
    },
  ],
};

await writeBundle('pack.opys', manifest, {
  [id]: blobFile('./server.properties'), // where the blob's bytes are
});

readBundleHead('pack.opys'); // { format: 1 }
readBundle('pack.opys'); // the manifest
```

## The format

Every structure of a bundle: what it is, its fields, and how it is written.

```text
Bundle                 a zip
├── opys.json          Head
├── manifest.json      Manifest
└── blobs/<sha256>     the carried files
```

### Bundle

How a manifest is published: one zip, usually named `.opys`.

| Entry            | What it is                                              |
| ---------------- | ------------------------------------------------------- |
| `opys.json`      | The `Head`.                                             |
| `manifest.json`  | The `Manifest`, whole, as `@opys/core` describes it.    |
| `blobs/<sha256>` | One per carried file, named by the hash of its content. |

```text
pack.opys
├── opys.json
├── manifest.json
└── blobs/
    └── 3d862eef2acd67a2dcb60351bda23e6ad7ebd51939b393eede30ec140ba3c20d
```

- A bundle that names a blob it does not hold is refused before anything is
  installed.
- Two builds of the same manifest give the same bytes.
- Any zip tool reads one: `unzip -p pack.opys manifest.json`.

### Head

What a bundle says about itself, apart from the installation it carries.

| Field      | Type          | What it is                                      |
| ---------- | ------------- | ----------------------------------------------- |
| `format`   | `number`      | The format version: `1`.                        |
| `options?` | `OptionDef[]` | What a player may set. See [Options](#options). |

<!-- prettier-ignore -->
```jsonc
// opys.json
{
  "format": 1
}
```

- A reader refuses any `format` but its own, an older one as much as a newer,
  before it reads the manifest.
- Nothing of the manifest is in the head. Variables, the launch command and
  cleanup rules are in `manifest.json`.
- The head is written first and uncompressed, so it is readable without
  unpacking the rest.

### Options

What whoever launches the bundle may choose, in the head. Each option fills
a variable, or switches a feature, that the manifest already reads.

<!-- prettier-ignore -->
```js
const written = options()
  .slider('xmx', { min: 1024, max: 16384, step: 512, default: 4096 })
    .title('RAM')
    .unit('MB')
  .select('preset', { low: 'Low', high: 'High' })
    .title('Graphics')
  .text('server')
    .title('Server')
    .placeholder('play.example.net')
  .file('skin')
    .title('Skin')
  .feature('custom_java', (o) => o
    .directory('java_home')
      .title('Java folder'))
    .title('Custom Java');
```

A kind adds an option, and the steps after it belong to that option.

| Kind                       | Names      | In the call                     | Steps                    |
| -------------------------- | ---------- | ------------------------------- | ------------------------ |
| `.slider(name, range)`     | a variable | `min`, `max`, `step`, `default` | `unit`                   |
| `.select(name, choices)`   | a variable | `{ value: label }`              | `default`                |
| `.text(name)`              | a variable |                                 | `placeholder`, `default` |
| `.file(name)`              | a variable |                                 |                          |
| `.directory(name)`         | a variable |                                 |                          |
| `.feature(name, options?)` | a feature  | its options, as a function      | `default`, `options`     |

Every kind also has `title`, which it needs, and `subtitle`.

Each kind is a function of its own too, for a list:

<!-- prettier-ignore -->
```js
const written = [
  slider('xmx', { min: 1024, max: 16384, step: 512, default: 4096 }).title('RAM'),
  feature('custom_java')
    .title('Custom Java')
    .options(directory('java_home').title('Java folder')),
];
```

In the head an option is told apart by the field that holds its name:

<!-- prettier-ignore -->
```jsonc
{ "slider": "xmx", "title": "RAM", "min": 1024, "max": 16384, "step": 512, "default": 4096, "unit": "MB" }
{ "select": "preset", "title": "Graphics", "choices": [{ "value": "low", "label": "Low" }, { "value": "high", "label": "High" }], "default": "low" }
{ "feature": "custom_java", "title": "Custom Java", "options": [{ "directory": "java_home", "title": "Java folder" }] }
```

- A chain is a value. Every step returns a new one.
- The options under a feature only matter while it is on. They nest to any
  depth.
- A select starts on its first choice unless `default` says otherwise.
  Choices keep the order written, except values that look like whole
  numbers, which JavaScript lists first.
- A name is one option: a variable or a feature named twice is refused.
- A slider's `default` is inside `min` to `max`.
- This is a schema only. What a player chose reaches an install as `vars`
  and `features`.

### Manifest

The entry `manifest.json`: every file to install, how to start the game, and
what to delete. It is exactly what `decodeManifest` of `@opys/core` reads,
with no field of the bundle's own.

<!-- prettier-ignore -->
```jsonc
// manifest.json
{
  "vars": { "root": "/games/pack" },
  "artifacts": [
    {
      "path": "${root}/server.properties",
      "source": { "blob": "3d862eef2acd67a2dcb60351bda23e6ad7ebd51939b393eede30ec140ba3c20d" },
      "size": 11
    }
  ],
  "launch": { "command": "java", "workdir": "${root}" },
  "cleanup": [{ "includes": ["${root}/mods/*.jar"] }]
}
```

### Blobs

Not part of the format: where each blob's bytes are **before** they are in a
bundle. A map from blob id to `{ file }` or `{ bytes }` (base64), handed to
`writeBundle`. A pack author never writes one: `opys build` makes it from the
artifacts whose source is a file or bytes.

```js
{ '3d862eef…': { file: './server.properties' } }
```

### Blob

A file carried in the bundle. An artifact names it as `{ "blob": "<sha256>" }`
and its bytes are the entry `blobs/<sha256>`.

- The name is the sha256 of the content, as 64 lowercase hex digits.
- A blob two artifacts use is stored once.
- Each blob is checked against its name when it is written and again when it
  is installed.

## Functions

| Function                                     | What it does                                      |
| -------------------------------------------- | ------------------------------------------------- |
| `writeBundle(path, manifest, blobs?, head?)` | Writes a bundle. Refuses a blob it was not given. |
| `readBundle(path)`                           | The manifest of a bundle.                         |
| `readBundleHead(path)`                       | The head alone. One small read.                   |
| `options()`, `slider`, `select`, …           | The options of a head. See [Options](#options).   |
| `optionDefs(options)`                        | Options as the head spells them.                  |
| `hashBlobFile(path)`, `blobId(bytes)`        | The id a carried file goes by.                    |
| `blobFile(path)`, `blobBytes(bytes)`         | Where a blob's bytes are, for `writeBundle`.      |
| `BUNDLE_FORMAT`                              | `1`.                                              |

## Every function

Each function, with what it returns.

<!-- prettier-ignore -->
```js
await writeBundle('pack.opys', manifest, { [id]: blobFile('./server.properties') });
await writeBundle('pack.opys', manifest, { [id]: blobBytes(bytes) }); // bytes made in memory
await writeBundle('pack.opys', { vars: {}, artifacts: [] });          // no carried files
await writeBundle('pack.opys', manifest, {});
// rejects: the manifest names blob 3d862eef…, and nothing holds it
await writeBundle('pack.opys', manifest, blobs, { options: options().file('a').title('A') });
await writeBundle('pack.opys', manifest, blobs, { options: options().file('a') });
// rejects: option 'a' has no title: add .title('…') to it

optionDefs(options().file('a').title('A')); // [{ file: 'a', title: 'A' }]

await hashBlobFile('./server.properties'); // { id: '3d862eef…', size: 11 }
blobId(new TextEncoder().encode('hello')); // '2cf24dba…'

readBundleHead('pack.opys'); // { format: 1, options? }
readBundle('pack.opys');     // { vars, artifacts, launch, cleanup }
readBundle('notes.txt');     // throws: not a bundle: …
BUNDLE_FORMAT;               // 1
```

`writeBundle` writes beside the destination and moves the file into place, so
a failed write leaves the previous bundle as it was.

## Documentation

- [The bundle](https://harmoniya-net.github.io/opys/basics/bundle): what it is and why
- [The bundle file](https://harmoniya-net.github.io/opys/format/bundle): the layout, for another reader or writer
- [The format](https://harmoniya-net.github.io/opys/format/): the manifest inside

Part of [opys](https://github.com/harmoniya-net/opys).
