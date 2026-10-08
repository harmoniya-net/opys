# opys CLI

Command-line interface for building and launching Minecraft client installations from declarative manifests.

## Install

```sh
npm install -g @opys/cli
```

Or run directly without installing:

```sh
npx @opys/cli <command>
```

## Commands

### `opys build`

Reads a JS config file, runs its plugins, and writes a **bundle**: the manifest
and the files it carries, as one file.

```sh
opys build [--input opys.config.mjs] [--output game.opys]
```

| Flag       | Short | Default                | Description                |
| ---------- | ----- | ---------------------- | -------------------------- |
| `--input`  | `-i`  | `opys.config.mjs`      | Path to the JS config file |
| `--output` | `-o`  | value from config file | Where to write the bundle  |

If `--output` is omitted and the config has no `output` field, the manifest is
printed to stdout as JSON. That is a view of it for reading and diffing — the
files it carries are not in it, so it is not something to install from.

### `opys install`

Everything `opys launch` does except starting the game.

```sh
opys install [--input opys.config.mjs] [--mode m]
opys install <bundle.opys> [--var key=value ...]
```

Artifacts are fetched, verified and extracted as usual. Then, if the manifest
names horno, horno is run once with `-Dhorno.installOnly=true`: the loader's
processors build a patched client jar on the machine that runs them, and
pre-1.13 the client jar is rewritten outright, so neither can happen anywhere
but here. Forge 1.6.1-1.12.2 names no horno properties and needs no such step.

### `opys launch`

Installs missing artifacts and spawns the JVM.

```sh
opys launch [--input opys.config.mjs] [--mode m]
opys launch <bundle.opys> [--var key=value ...]
```

With no argument the config is built in memory and launched as it is, with no
bundle written. With a path, that bundle is installed and launched exactly as
a deployed launcher would: no config is read, so machine-specific vars
(`root`, `username`, `token`, …) come from `--var`, which is repeatable.

## Config file (`opys.config.mjs`)

```js
import { defineConfig, files, userDataDir } from '@opys/dev';
import { forge, java } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    forge('1.20.1-best'),
    java('17'),
    // Local files, carried in the bundle. Give a `url` instead to point at
    // copies you publish yourself.
    files({ from: 'mods', to: '${game_directory}/mods/${rel}' }),
  ],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ forge }) => [forge.jvmArgs, forge.mainClass, forge.gameArgs],
    workdir: '${game_directory}',
  },
  // Runs on the launching machine, every launch: the place for machine paths.
  runClient: (manifest) => ({
    vars: { ...manifest.vars, root: userDataDir('my-pack') },
  }),
});
```

## Exit codes

| Code | Meaning                          |
| ---- | -------------------------------- |
| 0    | Success                          |
| 1    | Usage error (bad args / config)  |
| 2    | Network error                    |
| 3    | Integrity check failed           |
| 4    | Extraction failure               |
| 5    | The game started and then failed |
