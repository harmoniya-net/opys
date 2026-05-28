# opys

TypeScript monorepo for building and launching Minecraft client installations from declarative manifests.

## How it works

1. **Write a config** (`opys.config.mjs`) — a list of plugins plus a `manifest` block.
2. **Run `opys build`** — every plugin's `build` hook runs, the contributions are merged, and a `opys.json` manifest is written.
3. **Run `opys launch`** — reads `opys.json`, applies the `runClient` launch-time patch, installs every artifact (skipping cached ones), then spawns the process.

## Quick start

```sh
npm install -g @opys/cli
npm install -D @opys/dev @opys/minecraft
```

The CLI is resolved globally; `opys.config.mjs` is imported from your project, so its `@opys/…` imports resolve through your project's `node_modules` — like any config-driven tool (Vite, Vitest, …).

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { minecraft, userDataDir } from '@opys/minecraft';

export default defineConfig({
  output: 'opys.json',
  plugins: [minecraft('1.20.1')],
  manifest: {
    command: () => 'java',
    args: ({ minecraft }) => [
      minecraft.jvmArgs,
      minecraft.mainClass,
      minecraft.gameArgs,
    ],
    workdir: '${game_directory}',
    vars: { root: userDataDir('my-pack') },
  },
  runClient: (manifest) => ({
    vars: { ...manifest.vars, username: 'Player', uuid: '…', token: '…' },
  }),
});
```

```sh
opys build     # → opys.json
opys launch    # install + launch
```

## Architecture

A **plugin** is a bundler-style `{ name, build }` object — pure to construct, all
I/O inside `build`. Each plugin contributes `{ artifacts, vars, launch }`; the
`@opys/dev` engine merges every plugin's contribution and assembles the manifest
via the config's `command`/`args` accessor functions.

The build side (`dev` + plugins) and the runtime side (`runtime`) are joined
**only** by the frozen `opys.json` format — `runtime` depends on `core` alone.

## Packages

| Package                               | Description                                            |
| ------------------------------------- | ------------------------------------------------------ |
| [`@opys/mojang-rules`](mojang-rules/) | Mojang-standard rule format (os/features/rule/ruleset) |
| [`@opys/core`](core/)                 | Manifest data model + shorthand + `Val` — frozen spec  |
| [`@opys/dev`](dev/)                   | Plugin SDK + `defineConfig` + the build engine         |
| [`@opys/mojang`](mojang/)             | Zero-binding Mojang JSON parsers                       |
| [`@opys/minecraft`](minecraft/)       | Minecraft-domain plugins (minecraft/forge/curseforge…) |
| [`@opys/java`](java/)                 | OpenJDK provisioning plugin                            |
| [`@opys/runtime`](runtime/)           | Install + launch executor                              |
| [`@opys/cli`](cli/)                   | `opys` CLI entry point                                 |

### Dependency graph

```
cli       → dev, runtime, minecraft, java
dev       → core
runtime   → core
minecraft → dev, core, mojang
java      → dev, core
core      → mojang-rules
mojang    → mojang-rules
```

## Manifest format

A `opys.json` describes:

- **`vars`** — interpolation variables, optionally OS-conditional
- **`artifacts`** — artifacts to download/copy/extract, each with source, integrity, extract rules, and platform rules. A [`pointer`](API.md#pointer-sources) source resolves a opys descriptor at install time; a [`discovery`](API.md#discovery) block reads integrity/size from metadata a 3rd-party host already publishes
- **`launch`** — command, workdir, args, and env vars to spawn after installation

## Development

```sh
npm run build    # build all packages
npm run test     # run unit tests
npm run test:int # run integration tests
```

See [`CLAUDE.md`](CLAUDE.md) for the architecture, principles, and conventions.
