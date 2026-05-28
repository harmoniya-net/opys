# @opys/minecraft

Bridge layer that converts Mojang version JSON into Manifest artifacts and launch config. Owns the Minecraft template and config helpers.

## Install

```sh
npm install @opys/minecraft @opys/core @opys/rules zod
```

## API

### `resolveMinecraft(options?)`

Fetches the Mojang version manifest and a specific version (or latest), then returns a `MinecraftTemplate` ready to be merged into a Manifest config.

```ts
import { resolveMinecraft } from '@opys/minecraft';

const template = await resolveMinecraft({ version: '1.20.1' });
// or omit version for latest release
const template = await resolveMinecraft();

template.artifacts; // Artifact[] — client jar, libraries, asset index, asset objects
template.vars; // ValDefs — all interpolation variables
template.launch; // Launch — assembled (main class + args), drop into manifest.launch
template.jvmArgs; // Valset — JVM args alone, for composition
template.mainClass; // Val — main class wrapped (raw at .value[0])
template.gameArgs; // Valset — game args alone, for composition
```

### `clientToTemplate(client)`

Low-level mapper if you already have a parsed `Client` from `@opys/mojang`.

```ts
import { fetchClient, clientToTemplate } from '@opys/minecraft';

const { client } = await fetchClient('1.20.1');
const template = await clientToTemplate(client);
```

### `artifactScanner(options?)`

Async generator that yields `Artifact` entries by scanning a local directory. Used in `opys.config.mjs` to include mod JARs or other local files.

```ts
import { artifactScanner } from '@opys/minecraft';

// yields Artifact for each file under mods/
const scanner = artifactScanner({ dir: 'mods', into: '${root}/mods' });
```

### Config helpers

Re-exported from `@opys/core` for convenience:

```ts
import { defineConfig, resolveConfig } from '@opys/minecraft';
```

## Variable reference

The template sets these vars (interpolatable with `${name}`):

| Variable            | Default                            |
| ------------------- | ---------------------------------- |
| `root`              | `.`                                |
| `version_name`      | Minecraft version id               |
| `version_dir`       | `${root}/versions/${version_name}` |
| `library_directory` | `${root}/libraries`                |
| `natives_directory` | `${version_dir}/natives`           |
| `assets_root`       | `${root}/assets`                   |
| `game_directory`    | `${root}/`                         |
| `username`          | (must be supplied at launch)       |
| `uuid`              | (must be supplied at launch)       |
| `token`             | (must be supplied at launch)       |
