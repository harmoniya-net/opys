# The CLI

Three commands. Each does a little more than the one before.

| Command        | Does                                            |
| -------------- | ----------------------------------------------- |
| `opys build`   | Runs your config and writes a bundle.           |
| `opys install` | Downloads and unpacks everything. No game.      |
| `opys launch`  | Installs what is missing, then starts the game. |

```sh
npm install -g @opys/cli
```

## Day to day

```sh
opys launch            # try the pack you are working on
opys build             # write the bundle to share
opys launch game.opys --var root=/tmp/test …   # test it as a player
```

## Config or bundle

`install` and `launch` take either.

**No argument:** they read `opys.config.mjs`, build it into a temporary bundle,
and apply your `run`. This is for you, while making the pack.

**A bundle path:** they use that file as it is. No config is read, so there
is no `run`, and the player's values come from `--var`. This is what a
player does.

```sh
opys launch game.opys --var root=/path/to/install --var username=Player \
  --var uuid=00000000-0000-0000-0000-000000000001 --var token=0
```

## Flags

| Flag              | Commands            | Does                                              |
| ----------------- | ------------------- | ------------------------------------------------- |
| `-i`, `--input`   | all                 | Config file. Default `opys.config.mjs`.           |
| `-o`, `--output`  | `build`             | Bundle to write. Overrides the config's `output`. |
| `--mode <name>`   | all                 | Passed to the config as `mode`.                   |
| `--var key=value` | `install`, `launch` | Sets a variable. Repeatable.                      |
| `--feature a,b`   | `install`, `launch` | Switches on a feature, such as `java_console`.    |
| `--log-level <l>` | all                 | `silent`, `error`, `warn`, `info`, `debug`.       |
| `-h`, `--help`    |                     | Prints usage.                                     |

Good to know:

- `--var` wins over the same variable from `run`.
- A relative `-o` or `output` is relative to the config file.
- With no output named at all, `build` prints the manifest as JSON. Good for
  reading and diffing, not for installing.

## When to use `install`

Forge and NeoForge finish their setup on the player's machine, normally
during the first launch. `opys install` does it ahead of time.

Use it to prepare an installation, or in a script that should not start the
game.

## Exit codes

| Code | Meaning                                                |
| ---- | ------------------------------------------------------ |
| 0    | Success.                                               |
| 1    | A mistake in the command or config, or a failed build. |
| 2    | A download failed.                                     |
| 3    | A file did not match its hash.                         |
| 4    | An archive could not be unpacked.                      |
| 5    | The game started, then exited with its own error.      |

What to do about each: [Troubleshooting](/reference/troubleshooting).
