# torba

TypeScript monorepo for building and launching Minecraft client installations from declarative manifests.

## How it works

1. **Write a config** (`torba.config.mjs`) that describes which Minecraft version to install and any extra mods.
2. **Run `torba build`** — fetches Mojang metadata and writes a `torba.json` manifest.
3. **Run `torba launch`** — installs every artifact listed in the manifest (skipping cached ones), then spawns the JVM.

## Quick start

Install the CLI globally and the runtime deps your config imports locally in your project:

```sh
npm install -g @torba/cli
npm install -D @torba/minecraft        # plus @torba/forge etc. as needed
```

The CLI is resolved globally, but `torba.config.mjs` is imported from your project — its `import { … } from '@torba/…'` statements resolve through your project's `node_modules`, like any other config-driven tool (Vite, Vitest, Webpack, etc.).

```js
// torba.config.mjs
import { defineConfig } from '@torba/core';
import { resolveMinecraft } from '@torba/minecraft';

export default defineConfig(async () => {
  const mc = await resolveMinecraft({ version: '1.20.1' });
  return {
    output: 'torba.json',
    manifest: {
      artifacts: [mc.artifacts],
      vars: mc.vars,
      launch: mc.launch,
    },
  };
});
```

```sh
torba build                            # → torba.json
torba launch --var username=Player --var uuid=<uuid> --var token=<token>
```

## Packages

| Package                          | Description                                                   |
| -------------------------------- | ------------------------------------------------------------- |
| [`@torba/rules`](rules/)         | Pure platform/feature rule evaluation                         |
| [`@torba/core`](core/)           | Data model — types, schemas, factory functions                |
| [`@torba/mojang`](mojang/)       | Zero-binding Mojang JSON parsers                              |
| [`@torba/minecraft`](minecraft/) | Converts Mojang types to Manifest artifacts and launch config |
| [`@torba/forge`](forge/)         | Forge mod loader template builder                             |
| [`@torba/installer`](installer/) | Programmatic install and launch                               |
| [`@torba/cli`](cli/)             | `torba` CLI entry point                                       |

### Dependency graph

```
cli       → installer, minecraft, core
installer → core, rules
minecraft → mojang, core, rules
forge     → minecraft, mojang, core
core      → rules
mojang, rules → zod
```

## Manifest format

A `torba.json` describes:

- **`vars`** — interpolation variables, optionally OS-conditional
- **`artifacts`** — artifacts to download/copy/extract, each with source, integrity, extract rules, and platform rules. An artifact can track an evolving upstream (e.g. an always-latest translation pack): a [`pointer`](API.md#pointer-sources) source resolves a torba descriptor at install time, or a [`discovery`](API.md#discovery) block reads integrity/size from metadata a plain 3rd-party host already publishes
- **`launch`** — command, workdir, args, and env vars to spawn after installation

See [`API.md`](API.md) for the full public API and lifecycle.

## Development

```sh
npm run build    # build all packages
npm run test     # run unit tests in all packages
npm run test:int # run integration tests
```
