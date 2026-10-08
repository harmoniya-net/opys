# @opys/core

[![npm](https://img.shields.io/npm/v/@opys/core.svg)](https://www.npmjs.com/package/@opys/core)

The manifest data model: the types a manifest is made of, the functions that read, write and check one, and the bundle it is published as. It is the reference implementation of the manifest format. Its functions are typed wrappers over native code; its types are plain data.

```sh
npm install @opys/core
```

```js
import {
  blobFile,
  hashBlobFile,
  readBundleHead,
  satisfiesRuleset,
  writeBundle,
} from '@opys/core';

// A rule is written as shorthand or as an object; both are the format.
const rules = [
  'allow.os.linux',
  { action: 'disallow', features: { demo: true } },
];
satisfiesRuleset(rules, { name: 'linux', version: '', arch: 'x86_64' }); // true

// A blob is named by the sha256 of its bytes; a bundle holds a manifest and its blobs.
const { id } = await hashBlobFile('./server.jar');
const blobs = { [id]: blobFile('./server.jar') };
await writeBundle('server.opys', manifest, blobs); // manifest names { blob: id }
const head = readBundleHead('server.opys'); // format, vars, launch, cleanup
```

- A source is `{ url }` or `{ blob }`, told apart by which field is present. A blob artifact needs no `integrity`: its name is the hash.
- A bundle is a plain zip: `opys.json` (the head, first and uncompressed), `artifacts.json` and `blobs/<sha256>`. `readBundleHead` reads the head without the artifact list.
- `Rule` and `Ruleset` admit the shorthand and the expanded object. `MojangRule` and `MojangRuleset` are the expanded form, and the only one the evaluator takes. `satisfiesRuleset` here accepts both; the strict one is in `@opys/mojang`.
- `filterManifest` filters artifacts only. `vars` and `launch` keep their conditional arms, and `resolveVars` takes a flat map of strings.

## Documentation

- [@opys/core](https://harmoniya-net.github.io/opys/plugins/core): every export, with its signature.
- [The manifest](https://harmoniya-net.github.io/opys/reference/manifest): every field of the format.
- [The bundle format](https://harmoniya-net.github.io/opys/reference/bundle-format): the layout of the zip.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit.
