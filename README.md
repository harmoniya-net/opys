# torba

TypeScript monorepo for building and launching Minecraft client installations from declarative manifests.

## How it works

1. **Write a config** (`torba.config.mjs`) — a list of plugins plus a `manifest` block.
2. **Run `torba build`** — every plugin's `build` hook runs, the contributions are merged, and a `torba.json` manifest is written.
3. **Run `torba launch`** — reads `torba.json`, applies the `runClient` launch-time patch, installs every artifact (skipping cached ones), then spawns the process.

## Quick start

```sh
npm install -g @torba/cli
npm install -D @torba/dev @torba/minecraft
```

The CLI is resolved globally; `torba.config.mjs` is imported from your project, so its `@torba/…` imports resolve through your project's `node_modules` — like any config-driven tool (Vite, Vitest, …).

```js
// torba.config.mjs
import { defineConfig } from '@torba/dev';
import { minecraft, userDataDir } from '@torba/minecraft';

export default defineConfig({
  output: 'torba.json',
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
torba build     # → torba.json
torba launch    # install + launch
```

## Architecture

A **plugin** is a bundler-style `{ name, build }` object — pure to construct, all
I/O inside `build`. Each plugin contributes `{ artifacts, vars, launch }`; the
`@torba/dev` engine merges every plugin's contribution and assembles the manifest
via the config's `command`/`args` accessor functions.

The build side (`dev` + plugins) and the runtime side (`runtime`) are joined
**only** by the frozen `torba.json` format — `runtime` depends on `core` alone.

## Packages

| Package                                | Description                                            |
| -------------------------------------- | ------------------------------------------------------ |
| [`@torba/mojang-rules`](mojang-rules/) | Mojang-standard rule format (os/features/rule/ruleset) |
| [`@torba/core`](core/)                 | Manifest data model + shorthand + `Val` — frozen spec  |
| [`@torba/dev`](dev/)                   | Plugin SDK + `defineConfig` + the build engine         |
| [`@torba/mojang`](mojang/)             | Zero-binding Mojang JSON parsers                       |
| [`@torba/minecraft`](minecraft/)       | Minecraft-domain plugins (minecraft/forge/curseforge…) |
| [`@torba/java`](java/)                 | OpenJDK provisioning plugin                            |
| [`@torba/runtime`](runtime/)           | Install + launch executor                              |
| [`@torba/cli`](cli/)                   | `torba` CLI entry point                                |

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

A `torba.json` describes:

- **`vars`** — interpolation variables, optionally OS-conditional
- **`artifacts`** — artifacts to download/copy/extract, each with source, integrity, extract rules, and platform rules. A [`pointer`](API.md#pointer-sources) source resolves a torba descriptor at install time; a [`discovery`](API.md#discovery) block reads integrity/size from metadata a 3rd-party host already publishes
- **`launch`** — command, workdir, args, and env vars to spawn after installation

## Development

```sh
npm run build    # build all packages
npm run test     # run unit tests
npm run test:int # run integration tests
```

See [`CLAUDE.md`](CLAUDE.md) for the architecture, principles, and conventions.
