# @opys/cli

[![npm](https://img.shields.io/npm/v/@opys/cli.svg)](https://www.npmjs.com/package/@opys/cli)

The `opys` command. It turns a config file into a Minecraft installation: it
builds one into a single shareable file, and installs and launches either the
config or a built file.

```sh
npm install -g @opys/cli
```

It needs Node.js 20 or newer. A config is an ordinary JavaScript file, so
install what it imports in your project:
`npm install -D @opys/dev @opys/minecraft`.

```sh
opys launch                 # build the config, install, start the game
opys install                # the same, without starting the game
opys build                  # write the bundle the config's `output` names

# A built bundle runs without the config. The player's values come from --var.
opys launch game.opys --var root=/path/to/install --var username=Player \
  --var uuid=00000000-0000-0000-0000-000000000001 --var token=0
```

| Exit code | Meaning                                                   |
| --------- | --------------------------------------------------------- |
| 0         | Success                                                   |
| 1         | A mistake in the command or config, or a failure to build |
| 2         | A download failed                                         |
| 3         | A file did not match its hash                             |
| 4         | An archive could not be unpacked                          |
| 5         | The game started, then exited with an error of its own    |

## Documentation

- [Introduction](https://harmoniya-net.github.io/opys/basics/intro)
- [The CLI](https://harmoniya-net.github.io/opys/basics/cli)
- [Troubleshooting](https://harmoniya-net.github.io/opys/reference/troubleshooting)

Part of [opys](https://github.com/harmoniya-net/opys).
