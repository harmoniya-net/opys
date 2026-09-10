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

Reads a JS config file, fetches Mojang metadata, and writes a `opys.json` manifest.

```sh
opys build [--input opys.config.mjs] [--output opys.json]
```

| Flag       | Short | Default                | Description                       |
| ---------- | ----- | ---------------------- | --------------------------------- |
| `--input`  | `-i`  | `opys.config.mjs`      | Path to the JS config file        |
| `--output` | `-o`  | value from config file | Output path for the manifest JSON |

If `--output` is omitted and the config has no `output` field, the manifest is written to stdout.

### `opys install`

Everything `opys launch` does except starting the game.

```sh
opys install [--input opys.config.mjs] [--mode m]
```

Artifacts are fetched, verified and extracted as usual. Then, if the manifest
names horno, horno is run once with `-Dhorno.installOnly=true`: the loader's
processors build a patched client jar on the machine that runs them, and
pre-1.13 the client jar is rewritten outright, so neither can happen anywhere
but here. Forge 1.6.1-1.12.2 names no horno properties and needs no such step.

### `opys launch`

Installs missing artifacts and spawns the JVM.

```sh
opys launch [manifest] [--var key=value ...]
```

Common vars to pass at launch: `username`, `uuid`, `token`.

## Config file (`opys.config.mjs`)

```js
import {
  defineConfig,
  resolveMinecraft,
  artifactScanner,
} from '@opys/minecraft';

export default defineConfig(async () => {
  const mc = await resolveMinecraft({ version: '1.20.1' });

  return {
    output: 'opys.json',
    manifest: {
      artifacts: [
        mc.artifacts,
        artifactScanner({
          directory: 'mods',
          url: 'https://cdn.example.com/mods/${path}',
          path: '${root}/mods/${path}',
        }),
      ],
      vars: mc.vars,
      launch: mc.launch,
    },
  };
});
```

## Exit codes

| Code | Meaning                         |
| ---- | ------------------------------- |
| 0    | Success                         |
| 1    | Usage error (bad args / config) |
| 2    | Network error                   |
| 3    | Integrity check failed          |
| 4    | Extraction failure              |
