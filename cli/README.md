# unifest CLI

Command-line interface for building and launching Minecraft client installations from declarative manifests.

## Install

```sh
bun add -g @unifest/cli
```

Or run directly:

```sh
bunx unifest <command>
```

## Commands

### `unifest build`

Reads a JS config file, fetches Mojang metadata, and writes a `unifest.json` manifest.

```sh
unifest build [--input unifest.config.mjs] [--output unifest.json]
```

| Flag       | Short | Default                | Description                       |
| ---------- | ----- | ---------------------- | --------------------------------- |
| `--input`  | `-i`  | `unifest.config.mjs`   | Path to the JS config file        |
| `--output` | `-o`  | value from config file | Output path for the manifest JSON |

If `--output` is omitted and the config has no `output` field, the manifest is written to stdout.

### `unifest install`

Installs all artifacts described in a manifest without launching the game.

```sh
unifest install [manifest] [--var key=value ...]
```

### `unifest launch`

Installs missing artifacts and spawns the JVM.

```sh
unifest launch [manifest] [--var key=value ...]
```

Common vars to pass at launch: `username`, `uuid`, `token`.

## Config file (`unifest.config.mjs`)

```js
import { unifestConfig } from '@unifest/core';
import { minecraft, artifactScanner } from '@unifest/mc';

export default unifestConfig(async () => {
  const mc = await minecraft({ version: '1.20.1' });

  return {
    output: 'unifest.json',
    artifacts: [
      mc.artifacts,
      artifactScanner({ dir: 'mods', into: '${root}/mods' }),
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
