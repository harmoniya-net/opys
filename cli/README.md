# torba CLI

Command-line interface for building and launching Minecraft client installations from declarative manifests.

## Install

```sh
npm install -g @torba/cli
```

Or run directly without installing:

```sh
npx @torba/cli <command>
```

## Commands

### `torba build`

Reads a JS config file, fetches Mojang metadata, and writes a `torba.json` manifest.

```sh
torba build [--input torba.config.mjs] [--output torba.json]
```

| Flag       | Short | Default                | Description                       |
| ---------- | ----- | ---------------------- | --------------------------------- |
| `--input`  | `-i`  | `torba.config.mjs`     | Path to the JS config file        |
| `--output` | `-o`  | value from config file | Output path for the manifest JSON |

If `--output` is omitted and the config has no `output` field, the manifest is written to stdout.

### `torba launch`

Installs missing artifacts and spawns the JVM.

```sh
torba launch [manifest] [--var key=value ...]
```

Common vars to pass at launch: `username`, `uuid`, `token`.

## Config file (`torba.config.mjs`)

```js
import { defineConfig, minecraft, artifactScanner } from '@torba/minecraft';

export default defineConfig(async () => {
  const mc = await minecraft({ version: '1.20.1' });

  return {
    output: 'torba.json',
    artifacts: [
      mc.artifacts,
      artifactScanner({
        directory: 'mods',
        url: 'https://cdn.example.com/mods/${path}',
        path: '${root}/mods/${path}',
      }),
    ],
    vars: mc.vars,
    command: mc.command,
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
