# @opys/mojang

Mojang protocol parsers — version manifest, client JSON, libraries, assets and
Maven coordinates — as a typed wrapper over the
[`opys-mojang`](https://crates.io/crates/opys-mojang) Rust crate.

**No I/O.** The package parses; the caller fetches.

## Install

```sh
npm install @opys/mojang
```

## API

### Version manifest

```ts
import {
  parseVersionManifest,
  findVersion,
  latestRelease,
  VERSION_MANIFEST_URL,
} from '@opys/mojang';

const manifest = parseVersionManifest(
  await (await fetch(VERSION_MANIFEST_URL)).json(),
);

const version = findVersion(manifest, '1.20.1');
const latest = latestRelease(manifest);

console.log(latest.id); // e.g. '1.21.4'
console.log(latest.url); // URL to the version JSON
```

### Client JSON

```ts
import { parseClient } from '@opys/mojang';

const client = parseClient(await (await fetch(version.url)).json());

client.id; // version string
client.mainClass; // entry point class
client.args.game; // game arguments
client.args.jvm; // JVM arguments
client.libraries; // library list with rules and artifact info
client.assetIndex; // asset index reference
```

### Asset manifest

```ts
import { parseAssetManifest } from '@opys/mojang';

const assets = parseAssetManifest(
  await (await fetch(client.assetIndex.url)).json(),
);
// assets.objects: Record<string, { hash: string; size: number }>
```

### Argument merging

```ts
import { mergeArgs } from '@opys/mojang';

// Merge vanilla args with a mod loader's overrides
const merged = mergeArgs(client.args, forgeArgs);
```

### Rules

The addon links `opys-mojang-rules` in statically, so the rule surface ships
here too — in **strict** Mojang form. The opys shorthand (`'allow.os.linux'`)
is `@opys/core`'s own spelling and is rejected:

```ts
import { satisfiesRuleset, decodeRuleset } from '@opys/mojang';

satisfiesRuleset(client.libraries[0].rules, {
  name: 'linux',
  version: '6.12',
  arch: 'x86_64',
});

decodeRuleset('allow.os.linux'); // throws — use @opys/core for shorthand
```

## Notes

- The only `@opys/*` dependency is
  [`@opys/mojang-rules`](https://npmjs.com/package/@opys/mojang-rules), which
  is types-only. Fetching, and every manifest concern, lives elsewhere.
- Use `@opys/minecraft` to convert parsed Mojang types into Manifest artifacts,
  and its `fetchVersionManifest` / `fetchAssetManifest` for retrying HTTP.
