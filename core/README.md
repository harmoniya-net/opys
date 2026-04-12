# @unifest/core

Data model for Unifest manifests. Discriminated unions, factory functions, Zod parsers, and encode/decode utilities. No I/O.

## Install

```sh
bun add @unifest/core @unifest/rules zod
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

### `Unifact` — a single installable artifact

An artifact has a source, optional integrity/size checks, optional extract rules, and optional rulesets that gate it per platform or feature.

```ts
import { UnifactSchema, encodeUnifact } from '@unifest/core';

const unifact = UnifactSchema.parse(raw);
encodeUnifact(unifact);
```

### `Unifest` — the manifest

```ts
interface Unifest {
  vars: ValDefs;
  launch?: Launch;
  unifacts: ReadonlyArray<Unifact>;
}

// Parse JSON or TOML string
const manifest = await parseUnifest(jsonOrTomlString);

// Filter to current platform
const filtered = filterUnifest(manifest, { name: 'linux', arch: 'x64' });

// Merge two manifests (b wins on conflicts)
const merged = mergeUnifest(a, b);

// Encode back to JSON-serializable object
encodeUnifest(manifest);
```

### `ValDefs` — interpolation variables

Variables support OS-conditional values and `${ref}` interpolation.

```ts
import {
  parseValDefs,
  encodeValDefs,
  resolveValDefs,
  resolveVars,
} from '@unifest/core';

const defs = parseValDefs(raw);
const flat = resolveValDefs(defs, platform); // pick OS-appropriate values
const vars = resolveVars(flat); // resolve ${ref} chains
const result = interpolate('${root}/assets', vars);
```

### `unifestConfig` — config file helper

Used as the default export in `unifest.config.mjs`:

```ts
import { unifestConfig } from '@unifest/core';

export default unifestConfig({
  artifacts: [...],
  vars: [...],
  command: { ... },
  output: 'unifest.json',
});

// Or as a function for context-aware configs
export default unifestConfig((ctx) => ({
  artifacts: ctx.mode === 'build' ? [...] : [],
}));
```
