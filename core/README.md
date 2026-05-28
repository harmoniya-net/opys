# @opys/core

Data model for Opys manifests. Types, factory functions, Zod parsers, and encode/decode utilities. No I/O.

## Install

```sh
npm install @opys/core @opys/rules zod
```

## Types

### `Source` — artifact origin

```ts
type Source =
  | { kind: 'url'; url: string }
  | { kind: 'file'; file: string }
  | { kind: 'string'; string: string }
  | { kind: 'empty' };

// Factory functions
sourceUrl('https://example.com/file.jar');
sourceFile('./local/file.jar');
sourceString('inline content');
sourceEmpty();

// Parse / encode
SourceSchema.parse(raw);
encodeSource(source);
```

### `ExtractRule` — zip extraction instructions

```ts
type ExtractRule =
  | { kind: 'pick'; file: string; into: string }          // single file
  | { kind: 'scan'; matches: string; into: string; ... }  // glob match
  | { kind: 'dump'; into: string; clean?: boolean; ... }  // full extract

// Factory functions
extractPick('lwjgl.dll', '${natives_directory}')
extractScan('*.so', '${natives_directory}', { excludes: ['META-INF/'] })
extractDump('${natives_directory}', { clean: true, excludes: ['META-INF/'] })

// Parse / encode
ExtractSchema.parse(raw)          // always returns ExtractRule[]
encodeExtract(rules)
```

### `Artifact` — a single installable artifact

An artifact has a source, optional integrity/size checks, optional extract rules, and optional rulesets that gate it per platform or feature.

```ts
import { ArtifactSchema, encodeArtifact } from '@opys/core';

const artifact = ArtifactSchema.parse(raw);
encodeArtifact(artifact);
```

### `Manifest` — the manifest

```ts
interface Manifest {
  vars: ValDefs;
  launch?: Launch;
  artifacts: ReadonlyArray<Artifact>;
}

// Parse JSON string
const manifest = await parseManifest(jsonString);

// Filter to current platform
const filtered = filterManifest(manifest, { name: 'linux', arch: 'x64' });

// Encode back to JSON-serializable object
encodeManifest(manifest);
```

### `ValDefs` — interpolation variables

Variables support OS-conditional values and `${ref}` interpolation.

```ts
import {
  parseValDefs,
  encodeValDefs,
  resolveValDefs,
  resolveVars,
} from '@opys/core';

const defs = parseValDefs(raw);
const flat = resolveValDefs(defs, platform); // pick OS-appropriate values
const vars = resolveVars(flat); // resolve ${ref} chains
const result = interpolate('${root}/assets', vars);
```

### `defineConfig` — config file helper

Used as the default export in `opys.config.mjs`:

```ts
import { defineConfig } from '@opys/core';

export default defineConfig({
  output: 'opys.json',
  manifest: {
    artifacts: [...],
    vars: [...],
    launch: { ... },
  },
});

// Or as a function for context-aware configs
export default defineConfig((ctx) => ({
  manifest: {
    artifacts: ctx.mode === 'build' ? [...] : [],
  },
}));
```
