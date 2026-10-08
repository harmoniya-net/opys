# The opys command

This page covers the `opys` command: its three subcommands, the two ways to
point them at an installation, every flag, what they print, and the exit
codes they return. It is a lookup. Read [Getting started](./getting-started)
first to see the command used in a whole pack.

## Subcommands

| Command        | What it does                                                                                 | Starts the game |
| -------------- | -------------------------------------------------------------------------------------------- | --------------- |
| `opys build`   | Runs the config's plugins and writes a bundle                                                | No              |
| `opys install` | Fetches, verifies and extracts everything, then runs the loader's install step if it has one | No              |
| `opys launch`  | Installs whatever is missing, starts the game and waits for it to exit                       | Yes             |

`install` and `launch` take the same arguments and share their first half.
`launch` is `install` followed by starting the game.

## Two forms of install and launch

`install` and `launch` each accept an installation in one of two forms.

**From a config.** Leave out the bundle argument. opys reads the config file
(`opys.config.mjs` unless you name another with `--input`), builds it in
memory, and installs from that. Nothing is written to disk first, and the
files the manifest carries are read from where they are. This is the form you
use while writing a pack. A `runClient` function in the config is applied
before the launch, so machine-specific values belong there.

**From a bundle.** Give the path to a `.opys` file. opys installs that bundle
exactly as it is. No config is read, so there is no `runClient`, and the
values that only the launching machine knows come from `--var`. This is the
path a deployed launcher takes, and it is the one to test before you publish.

```sh
opys launch
opys launch game.opys --var root=/path/to/install --var username=Player \
  --var uuid=00000000-0000-0000-0000-000000000001 --var token=0
```

A bundle cannot be combined with `--input`. opys refuses the command rather
than guess which one you meant.

## build

```sh
opys build [-i opys.config.mjs] [-o game.opys] [--mode build]
```

`build` reads the config, runs every plugin, and writes the result as a
bundle. Where the bundle goes is decided in this order:

1. `-o` / `--output`, if given.
2. The config's `output` field, if it has one.
3. Neither: the manifest is printed to stdout as JSON.

The JSON form is a view for reading and diffing. It does not include the
files the manifest carries, so it is not something to install from.

A relative `--output` (or a relative `output` in the config) is resolved
against the directory that holds the config file, not the directory you ran
the command from. `--input` is resolved against the current directory.

On success, `build` prints one line to stderr:

```
Written to game.opys (412 artifact(s), 3 blob(s))
```

While it works, `build` also prints lines of the form `[scope] message`: the
engine's own (`[opys] resolving 2 plugin(s)`, `[opys] merged N artifact(s)`
and any variable-collision warning) and the plugins' (`[java] Temurin
21.0.12.1+1`). They go to stderr, so with no output named, stdout holds the
JSON and nothing else.

`build` accepts only `--input`, `--output` and `--mode`. Passing `--var` or
`--feature` is a usage error. A positional argument is not an error: `build`
ignores it.

## install

```sh
opys install [-i opys.config.mjs] [--mode install] [--feature a,b] [--var k=v]...
opys install <bundle.opys> [--feature a,b] [--var k=v]...
```

`install` does everything `launch` does except start the game. It fetches,
verifies and extracts each artifact the installation needs, then checks
whether the manifest's launch arguments name horno. If they do, it runs
horno's install step once. See [horno and install](#horno-and-install).

If the manifest has no loader install step, `install` prints
`No loader install step; everything is in place` and exits 0. Forge
1.6.1 to 1.12.2 is an example: it needs no such step.

## launch

```sh
opys launch [-i opys.config.mjs] [--mode launch] [--feature a,b] [--var k=v]...
opys launch <bundle.opys> [--feature a,b] [--var k=v]...
```

`launch` runs the same install as `install`, then starts the game and prints
its process id:

```
Launching...
 PID 48213
```

It stays running until the game exits, and its exit status follows the game's
(see [Exit codes](#exit-codes)). It does not run horno's install step
separately: the game's own start does that work.

## Flags

### Per command

| Flag        | Short | Default                                            | Used by                      | Meaning                                                                                                                                                                            |
| ----------- | ----- | -------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--input`   | `-i`  | `opys.config.mjs`                                  | `build`, `install`, `launch` | Config file to build. Relative to the current directory. Not allowed with a bundle.                                                                                                |
| `--output`  | `-o`  | the config's `output`; with neither, print JSON    | `build`                      | Bundle to write. A relative path is relative to the config's directory.                                                                                                            |
| `--mode`    |       | the command's name: `build`, `install` or `launch` | `build`, `install`, `launch` | Passed to the config function as its `mode`. Ignored when a bundle is given.                                                                                                       |
| `--feature` |       | none                                               | `install`, `launch`          | Runtime features to install and launch with, as one comma-separated list. Spaces are trimmed and empty entries dropped. A feature switches on the rule-tagged values that name it. |
| `--var`     |       | none                                               | `install`, `launch`          | `key=value` to set a manifest variable. Repeatable. The value is everything after the first `=`, so `--var token=` sets an empty value. The key must not be empty.                 |

`--feature` and `--var` apply to both the config form and the bundle form.
`--var` values are layered over the variables the manifest already has, so a
bundle's own defaults stay in place unless you override them.

To give several features, put them in one comma-separated list, as in
`--feature java_console,other`. Repeating `--feature` keeps only the last
value.

::: tip Windows console
`--feature java_console` makes the Windows `java_bin` variable point at
`java.exe` rather than `javaw.exe`.
:::

### Global

These apply to every command. They can appear anywhere on the command line.

| Flag                  | Short | Default | Meaning                                                                                                                                                                                                      |
| --------------------- | ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--log-level <level>` |       | `info`  | How much to write to stderr: `silent`, `error`, `warn`, `info` or `debug`. An unknown level prints a warning and uses `info`.                                                                                |
| `-v`                  |       |         | Same as `--log-level debug`.                                                                                                                                                                                 |
| `--help`              | `-h`  |         | Print the usage summary to stdout and exit 0. Only recognised in the command position, after any global flags: `opys build --help` is an unknown-option error. Running `opys` with no command prints it too. |

There is no `--version` flag. `opys --version` is treated as an unknown
command and exits 1. The installed version is the `version` field of
`@opys/cli`'s `package.json`, which `npm ls -g @opys/cli` also reports.

### What the log level changes

`--log-level` controls the lines opys writes through its logger:
`Installing...`, `Ready in`, `Launching...`, `PID`, `Written to`, the loader
step lines and the `[scope] message` lines of the build, including the
variable-collision warning. They are all written at the `info` level, so at
`silent`, `error` or `warn` they are hidden.

It does not control the install progress (see below), and it does not control
errors. Those are written directly and always appear.

`-v` changes nothing visible. The command writes no debug lines, so `debug`
shows what `info` shows.

## horno and install

Some loaders finish their installation on the machine that runs them. Forge
and NeoForge build a patched client jar by running processors, and the oldest
Forge builds rewrite the client jar outright. The runtime cannot do that
during install, so the work is done by horno, the small Java program that
starts the game. See [horno](/internals/horno) for what horno does.

`install` runs horno once with nothing to launch afterwards:

1. It checks whether any of the manifest's launch arguments starts with
   `-Dhorno.`. If none does, there is no loader step and `install` stops.
2. Otherwise it builds the launch the manifest describes and adds
   `-Dhorno.installOnly=true` as the first JVM argument.
3. It starts that process and waits for it to exit.

The flag is added on the command line only. It is never written into the
manifest or the bundle, because the manifest describes an installation, not a
particular run of one.

If horno exits with a non-zero code, `install` exits 5. The message reads
`The game exited with code N`, even though it was horno's install step that
failed. The output above it is horno's own and is the thing to read.

`launch` does not add the flag and does not run this separate step. horno runs
as part of the game's start.

## Progress output

Progress is written to stderr. On a terminal, it updates in place. Piped or
captured output, as in CI, gets the overall line at most every three seconds.
The per-file and phase lines are still written as they happen.

A typical install prints, in order:

- `Installing...`
- An overall bar while files download, with a percentage, the count of files
  done and of files in total, the rate, and an estimate of time left. When the
  manifest gives file sizes, the percentage is measured in bytes. Otherwise it
  is measured in files.
- On a terminal, beneath the overall bar, one bar per file that is downloading
  at the moment, with its name and how far along it is.
- `  ✓ <file>` when each download finishes, with the file's name.
- ` Verifying...`, once the downloads are done.
- ` Extracting N archive(s)...`, when there are archives to unpack.
- ` Swept N stale file(s)`, when files from an older installation were removed.
- ` Ready in <time>`, when the install is complete.

`install` then prints `Running the loader install...` and ` Installed` if horno
ran. `launch` prints `Launching...` and ` PID <n>`.

`--log-level silent` hides the `Installing...` and `Ready in` lines, but the
bar and the per-file and phase lines are still written.

## Exit codes

| Code | Meaning                                                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Success. The game, or horno's install step, exited with code 0.                                                                                    |
| 1    | Usage error, a config or bundle that cannot be read or imported, a runtime error that is not one of codes 2 to 4, or an unexpected internal error. |
| 2    | Network error while installing. A network request failed.                                                                                          |
| 3    | Integrity check failed. The files that did not match their hash are listed on stderr.                                                              |
| 4    | Extraction failed. The archive and its cause are on stderr.                                                                                        |
| 5    | The game started and then exited with a failure, or horno's install step failed.                                                                   |

Exit 1 covers several different faults. The message tells them apart:

- Usage errors: an unknown flag, `--var` without `key=value`, a bundle
  combined with `--input`, a second bundle path, or a config with no default
  export. The message starts with `Error:`. An unknown command is reported as
  `Unknown command '<name>'`, followed by the usage text.
- Config errors, including a missing config file or one that throws, print
  `Unexpected error:` and then the stack trace.
- A failure while building, such as a plugin that cannot reach its API, also
  prints `Unexpected error:` and exits 1. Codes 2 to 4 describe the install
  only.
- A bundle that cannot be read, such as a missing file, also prints
  `Unexpected error:` and the stack trace.
- A runtime error, such as a file the install could not write, prints `Error:`.
- A failure to start a process, such as a Java binary that does not exist,
  is reported through the same `Unexpected error:` path.

Set `OPYS_QUIET=1` to leave the stack trace out of `Unexpected error:`
messages. The message itself is still printed.

::: warning A game killed by a signal exits 0
opys treats a child that exits with no code, which happens when something
kills it with a signal, as a success. A game that is killed exits opys with
0, not 5. Check the game's own output if a run seems to end too cleanly.
:::

## Related pages

- [Getting started](./getting-started) walks through `launch` and `build` on a
  whole pack.
- [Launch-time values](/guide/run-client) explains which values belong in
  `runClient` and which go in `--var`.
- [Publishing a bundle](/guide/publishing) covers what happens to the bundle
  you build.
- [Troubleshooting](/guide/troubleshooting) lists the messages you are most
  likely to see.
