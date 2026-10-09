# @opys/mojang

[![npm](https://img.shields.io/npm/v/@opys/mojang.svg)](https://www.npmjs.com/package/@opys/mojang)

Parsers for Mojang's own file formats: the version list, a version file, its
libraries, arguments and asset index. opys uses it to read what Mojang
publishes. You need it only if you are writing a loader plugin or a tool of
your own.

```sh
npm install @opys/mojang
```

```js
import {
  VERSION_MANIFEST_URL,
  findVersion,
  parseClient,
  parseVersionManifest,
} from '@opys/mojang';

const manifest = parseVersionManifest(
  await (await fetch(VERSION_MANIFEST_URL)).json(),
);
const version = findVersion(manifest, '1.21.1');
if (!version) throw new Error('no such version');

const client = parseClient(await (await fetch(version.url)).json());
client.mainClass; // the class the game starts from
client.libraries; // its libraries, with their rules
```

- The package does no network or file access. You fetch, it parses.
- Its rule functions take Mojang's own object form only. The short form
  (`'allow.os.linux'`) is opys's, and `@opys/core` accepts both.

## Documentation

- [How opys is built](https://harmoniya-net.github.io/opys/reference/architecture)

Part of [opys](https://github.com/harmoniya-net/opys).
