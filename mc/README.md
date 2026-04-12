# @unifest/mc

Bridge layer that converts Mojang version JSON into Unifest artifacts and launch config. Owns the Minecraft template and config helpers.

## Install

```sh
bun add @unifest/mc @unifest/core @unifest/rules zod
```

## API

### `minecraft(options?)`

Fetches the Mojang version manifest and a specific version (or latest), then returns a `MinecraftTemplate` ready to be merged into a Unifest config.

```ts
import { minecraft } from '@unifest/mc';

const template = await minecraft({ version: '1.20.1' });
// or omit version for latest release
const template = await minecraft();

template.artifacts; // Unifact[] — client jar, libraries, asset index, asset objects
template.vars; // ValDefs — all interpolation variables
template.command; // Launch — main class + args
```

### `clientToTemplate(client)`

Low-level mapper if you already have a parsed `Client` from `@unifest/minecraft`.

```ts
import { fetchClient, clientToTemplate } from '@unifest/mc';

const { client } = await fetchClient('1.20.1');
const template = await clientToTemplate(client);
```

### `artifactScanner(options?)`

Async generator that yields `Unifact` entries by scanning a local directory. Used in `unifest.config.mjs` to include mod JARs or other local files.

```ts
import { artifactScanner } from '@unifest/mc';

// yields Unifact for each file under mods/
const scanner = artifactScanner({ dir: 'mods', into: '${root}/mods' });
```

### Config helpers

Re-exported from `@unifest/core` for convenience:

```ts
import { unifestConfig, resolveConfig } from '@unifest/mc';
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
