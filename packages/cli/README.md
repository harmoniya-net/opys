# opys CLI

The `opys` command. It builds a Minecraft installation from a config file into a bundle, and installs and launches either the config or a built bundle.

## Install

```sh
npm install -g @opys/cli
```

It needs Node.js 20 or newer. The config is an ordinary JavaScript module, so install what it imports in your project, for example `npm install -D @opys/dev @opys/minecraft`.

## Commands

```sh
opys build   [-i opys.config.mjs] [-o game.opys]  # run the plugins, write a bundle
opys install [-i opys.config.mjs]                 # fetch, verify, extract, run the loader's install step; no game
opys launch  [-i opys.config.mjs]                 # install what is missing, then start the game

# From a built bundle no config is read, so machine values come from --var
opys launch game.opys --var root=/path/to/install --var username=Player \
  --var uuid=00000000-0000-0000-0000-000000000001 --var token=0
```

## Exit codes

| Code | Meaning                                                                                                     |
| ---- | ----------------------------------------------------------------------------------------------------------- |
| 0    | Success                                                                                                     |
| 1    | Usage error, a config or bundle that cannot be read, another runtime error, or an unexpected internal error |
| 2    | Network error while installing                                                                              |
| 3    | Integrity check failed                                                                                      |
| 4    | Extraction failed                                                                                           |
| 5    | The game started and then exited with a failure, or the loader's install step failed                        |

## Good to know

- `install` and `launch` take a config (built in memory, its `runClient` applied) or a bundle path; a bundle cannot be combined with `--input`. Both forms accept `--feature a,b` and a repeatable `--var key=value`.
- `build` writes to `-o`, else the config's `output`, else prints the manifest as JSON to stdout. That JSON is for reading and diffing, not for installing from.
- `--log-level silent|error|warn|info|debug` and `-v` apply to every command. There is no `--version` flag.
- A game killed by a signal makes `opys` exit 0, not 5.

## Documentation

- [The opys command](https://harmoniya-net.github.io/opys/guide/cli): every flag, the output, and the exit codes in full.
