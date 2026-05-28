# lanka CLI

Command-line interface for building and launching Minecraft client installations from declarative manifests.

## Install

```sh
npm install -g @lanka/cli
```

Or run directly without installing:

```sh
npx @lanka/cli <command>
```

## Commands

### `lanka build`

Reads a JS config file, fetches Mojang metadata, and writes a `lanka.json` manifest.

```sh
lanka build [--input lanka.config.mjs] [--output lanka.json]
```

| Flag       | Short | Default                | Description                       |
| ---------- | ----- | ---------------------- | --------------------------------- |
| `--input`  | `-i`  | `lanka.config.mjs`     | Path to the JS config file        |
| `--output` | `-o`  | value from config file | Output path for the manifest JSON |

If `--output` is omitted and the config has no `output` field, the manifest is written to stdout.

### `lanka launch`

Installs missing artifacts and spawns the JVM.

```sh
lanka launch [manifest] [--var key=value ...]
```

Common vars to pass at launch: `username`, `uuid`, `token`.

## Config file (`lanka.config.mjs`)

```js
import {
  defineConfig,
  resolveMinecraft,
  artifactScanner,
} from '@lanka/minecraft';

export default defineConfig(async () => {
  const mc = await resolveMinecraft({ version: '1.20.1' });

  return {
    output: 'lanka.json',
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
