# @opys/cli

[![npm](https://img.shields.io/npm/v/@opys/cli.svg)](https://www.npmjs.com/package/@opys/cli)

The `opys` command. It builds a config into one shareable file, and installs
and launches either the config or a built file.

```sh
npm install -g @opys/cli
```

Needs Node.js 20 or newer. A config is an ordinary JavaScript file, so
install what it imports in your project:

```sh
npm install -D @opys/dev @opys/minecraft
```

## Example

```sh
opys launch                 # build the config, install, start the game
opys install                # the same, without starting the game
opys build                  # write the bundle the config's `output` names
```

A built bundle runs without the config. The player's values come from
`--var`:

```sh
opys launch game.opys --var root=/path/to/install --var username=Player \
  --var uuid=00000000-0000-0000-0000-000000000001 --var token=0
```

## Commands

| Command                 | Builds | Installs | Starts the game |
| ----------------------- | ------ | -------- | --------------- |
| `opys build`            | yes    | no       | no              |
| `opys install`          | yes    | yes      | no              |
| `opys launch`           | yes    | yes      | yes             |
| `opys install <bundle>` | no     | yes      | no              |
| `opys launch <bundle>`  | no     | yes      | yes             |

- With no bundle named, a command reads `opys.config.mjs` in the current
  directory.
- `opys install` also runs the mod loader's own install step, which
  otherwise happens during the first launch.
- With a bundle named, no config is loaded, so its `run` does not happen.
  Pass what it would have set with `--var`.

## Options

| Option              | Commands            | What it does                                         |
| ------------------- | ------------------- | ---------------------------------------------------- |
| `-i`, `--input`     | all, with a config  | The config file. Default `opys.config.mjs`.          |
| `-o`, `--output`    | `build`             | The bundle to write. Default: the config's `output`. |
| `--mode <value>`    | all, with a config  | Passed to a config function. Default: the command.   |
| `--var <key=value>` | `install`, `launch` | Sets a variable. Repeat it for several.              |
| `--feature <a,b>`   | `install`, `launch` | Switches features on, comma separated.               |
| `--log-level <l>`   | all                 | `silent`, `error`, `warn`, `info` or `debug`.        |
| `-v`                | all                 | The same as `--log-level debug`.                     |

`opys build` with no `-o` and no `output` in the config prints the manifest
as JSON. That is for reading and comparing. It cannot be installed from,
because the carried files are not in it.

## Exit codes

| Code | Meaning                                                    |
| ---- | ---------------------------------------------------------- |
| 0    | Success.                                                   |
| 1    | A mistake in the command or config, or a failure to build. |
| 2    | A download failed.                                         |
| 3    | A file did not match its hash.                             |
| 4    | An archive could not be unpacked.                          |
| 5    | The game started, then exited with an error of its own.    |

## Every command

Each command, in each way it is used.

```sh
# build
opys build                               # writes the config's `output`
opys build -o dist/game.opys             # writes here instead
opys build -i packs/server.config.mjs    # another config
opys build --mode release                # the config function gets { mode: 'release' }
opys build > manifest.json               # no output named: the manifest, as JSON

# install, without starting the game
opys install
opys install --feature java_console
opys install game.opys --var root=/srv/game

# launch
opys launch
opys launch --mode dev                   # `mode` defaults to 'launch'
opys launch --var username=Tester        # overrides one variable
opys launch --feature java_console,custom_java
opys launch game.opys --var root=/srv/game --var username=Player \
  --var uuid=00000000-0000-0000-0000-000000000001 --var token=0

# how much it says
opys launch -v
opys build --log-level silent
```

## Documentation

- [Introduction](https://harmoniya-net.github.io/opys/basics/intro): a first pack
- [The CLI](https://harmoniya-net.github.io/opys/basics/cli): every command, and why it works this way
- [Troubleshooting](https://harmoniya-net.github.io/opys/reference/troubleshooting)

Part of [opys](https://github.com/harmoniya-net/opys).
