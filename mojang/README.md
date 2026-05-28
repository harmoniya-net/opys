# @opys/mojang

Zero-binding Mojang JSON parsers. Parses Mojang version manifests and client JSONs into typed structures. No dependencies on other unipack packages.

## Install

```sh
npm install @opys/mojang zod
```

## API

### Version manifest

```ts
import { fetchVersionManifest, findVersion, latestRelease } from '@opys/mojang';

const manifest = await fetchVersionManifest();

const version = findVersion(manifest, '1.20.1');
const latest = latestRelease(manifest);

console.log(latest.id); // e.g. '1.21.4'
console.log(latest.url); // URL to the version JSON
```

### Client JSON

```ts
import { parseClient } from '@opys/mojang';

const res = await fetch(version.url);
const client = parseClient(await res.json());

client.id; // version string
client.mainClass; // entry point class
client.args.game; // game arguments
client.args.jvm; // JVM arguments
client.libraries; // library list with rules and artifact info
client.assetIndex; // asset index reference
```

### Asset manifest

```ts
import { fetchAssetManifest } from '@opys/mojang';

const assets = await fetchAssetManifest(client.assetIndex.url);
// assets.objects: Record<string, { hash: string; size: number }>
```

### Argument merging

```ts
import { mergeArgs } from '@opys/mojang';

// Merge vanilla args with a mod loader's overrides
const merged = mergeArgs(client.args, forgeArgs);
```

## Notes

- This package is intentionally a leaf in the dependency graph — it has no unipack dependencies.
- Use `@opys/minecraft` to convert parsed Mojang types into Manifest artifacts.
