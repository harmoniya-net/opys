# @opys/core

[![npm](https://img.shields.io/npm/v/@opys/core.svg)](https://www.npmjs.com/package/@opys/core)

The frozen-manifest contract for opys: data model, opys shorthand,
`Val`/`Valset`, glob, interpolation. Behaviors are backed by the
[`opys-core`](https://crates.io/crates/opys-core) Rust crate via
napi-rs; domain types and small sugar helpers are hand-written TS.

```sh
npm install @opys/core
```

## Domain types

### `Source` — artifact origin

Discriminated by which field is present — this is the frozen wire shape, so
narrow with `'url' in source` rather than a tag.

```ts
type Source =
  | { url: string }
  | { file: string }
  | { string: string }
  | { bytes: string } // base64
  | { pointer: string };

sourceUrl('https://example.com/file.jar');
sourceFile('./local/file.jar');
sourceString('inline content');
Source.bytes(new Uint8Array([1, 2, 3])); // auto-base64
sourcePointer('forge:libraries.json');
```

### `ExtractRule` — zip extraction instructions

Discriminated the same way: `file` → pick, `matches` → scan, otherwise dump.

```ts
type ExtractRule =
  | { file: string; into: string } // single file
  | { matches: string; into: string; ... } // glob match
  | { into: string; clean?: boolean; ... }; // full extract

extractPick('lwjgl.dll', '${natives_directory}');
extractScan('*.so', '${natives_directory}', { excludes: ['META-INF/'] });
extractDump('${natives_directory}', { clean: true, excludes: ['META-INF/'] });
```

### `Artifact` — a single installable artifact

An artifact has a source, optional integrity/size checks, optional
extract rules, and an optional ruleset that gates it per platform or
feature.

### `Rule` / `Ruleset` — how a rule is written

A rule may be written two ways, and both are first-class: the opys shorthand
string, or the expanded Mojang object. A ruleset is one rule or an array of
them, and may be omitted entirely.

```ts
import type { Ruleset } from '@opys/core';

const rules: Ruleset = 'allow.os.linux';
const mixed: Ruleset = [
  'allow.os.osx@^10\\.',
  { action: 'disallow', features: { demo: true } },
];
```

`parseShortRuleset` expands either spelling into a `MojangRuleset` — the
canonical form, re-exported from `@opys/mojang-rules`, and the only one the
evaluator takes. `satisfiesRuleset` here accepts both spellings; the strict
Mojang-only predicate lives in `@opys/mojang`.

### `Manifest` — the frozen wire shape

```ts
import { parseManifest, filterManifest, encodeManifest } from '@opys/core';

const manifest = parseManifest(jsonString);
const filtered = filterManifest(manifest, {
  name: 'linux',
  version: '',
  arch: 'x86_64',
});
const wire = encodeManifest(filtered);
```

### `ValDefs` — interpolation variables with OS-conditional arms

```ts
import { filterManifest, resolveVars, interpolate } from '@opys/core';

const flat = filterManifest(manifest, platform).vars; // OS-appropriate values
const vars = resolveVars(flat); // resolve ${ref} chains
const result = interpolate('${root}/assets', vars);
```

## Build-time HTTP helper

```ts
import { fetchWithRetry } from '@opys/core';

const res = await fetchWithRetry('https://api.example.com/data', {
  attempts: 4,
  baseDelayMs: 250,
});
```

Used by every plugin that resolves data from upstream APIs. Bounded
exponential backoff on transient errors (network failures + 5xx);
4xx and JSON-parse failures surface unchanged.

## Frozen wire format

`opys.json` is the contract. Other opys packages layer on top:

- [`@opys/dev`](https://www.npmjs.com/package/@opys/dev) — config +
  plugin SDK that produces manifests.
- [`@opys/runtime`](https://www.npmjs.com/package/@opys/runtime) —
  install + launch executor that consumes manifests.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit.
