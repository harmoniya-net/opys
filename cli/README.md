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
