# unifest

TypeScript monorepo for building and launching Minecraft client installations from declarative manifests.

## How it works

1. **Write a config** (`unifest.config.mjs`) that describes which Minecraft version to install and any extra mods.
2. **Run `unifest build`** — fetches Mojang metadata and writes a `unifest.json` manifest.
3. **Run `unifest launch`** — installs every artifact listed in the manifest (skipping cached ones), then spawns the JVM.

## Quick start

```sh
bun add -g @unifest/cli
```

```js
// unifest.config.mjs
import { unifestConfig } from '@unifest/core';
import { minecraft } from '@unifest/mc';

export default unifestConfig(async () => {
  const mc = await minecraft({ version: '1.20.1' });
  return {
    output: 'unifest.json',
    artifacts: [mc.artifacts],
    vars: mc.vars,
    command: mc.command,
  };
});
```

```sh
unifest build                            # → unifest.json
unifest launch --var username=Player --var uuid=<uuid> --var token=<token>
```

## Packages

| Package                            | Description                                                   |
| ---------------------------------- | ------------------------------------------------------------- |
| [`@unifest/rules`](rules/)         | Pure platform/feature rule evaluation                         |
| [`@unifest/core`](core/)           | Data model — discriminated unions, schemas, factory functions |
| [`@unifest/minecraft`](minecraft/) | Zero-binding Mojang JSON parsers                              |
| [`@unifest/mc`](mc/)               | Converts Mojang types to Unifest artifacts and launch config  |
| [`@unifest/forge`](forge/)         | Forge mod loader template builder                             |
| [`@unifest/installer`](installer/) | Programmatic install and launch                               |
| [`@unifest/cli`](cli/)             | `unifest` CLI entry point                                     |

### Dependency graph

```
cli → installer, mc, core
installer → core, rules
mc → minecraft, core, rules
core → rules
minecraft → (zod only)
rules → (zod only)
```

## Manifest format

A `unifest.json` (or `.toml`) describes:

- **`vars`** — interpolation variables, optionally OS-conditional
- **`unifacts`** — artifacts to download/copy/extract, each with source, integrity, extract rules, and platform rules
- **`launch`** — command, workdir, args, and env vars to spawn after installation

See [`spec.md`](spec.md) for the full format specification.

## Development

```sh
npm run build    # build all packages
npm run test     # run unit tests in all packages
npm run test:int # run integration tests
```
