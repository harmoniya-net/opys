# @opys/mojang

Parsers for the formats Mojang publishes: the version manifest, a version JSON, libraries, arguments, asset indexes and Maven coordinates. It also holds the strict Mojang rule evaluator. A typed wrapper over the `opys-mojang` Rust crate.

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
const version = findVersion(manifest, '1.21.1'); // Version | undefined
if (!version) throw new Error('no such version');

const client = parseClient(await (await fetch(version.url)).json());
client.mainClass; // entry point class
client.args.game; // game arguments
client.libraries; // libraries, with their rules and artifact info
```

- The package does no I/O: you fetch the documents and it parses them. The fetch functions (`fetchVersionManifest`, `fetchAssetManifest`, `fetchClient`) are in `@opys/minecraft-vanilla`.
- The rule functions (`satisfiesRuleset`, `decodeRuleset`, and the rest) take Mojang's own form only. The opys shorthand, such as `'allow.os.linux'`, is rejected; `@opys/core` accepts both spellings.
- It also exports `parseAssetManifest`, `parseLibraries`, `parseArguments`, `mergeArgs` and the Maven helpers (`parseMaven`, `encodeMaven`, and others).

## Documentation

- [@opys/mojang](https://harmoniya-net.github.io/opys/plugins/mojang): every export, with its signature and types.
