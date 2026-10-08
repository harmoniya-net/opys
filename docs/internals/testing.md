# Testing

This page lists the checks in the repository, from the cheapest to the most
expensive, with the command for each and what it proves. It is for a
contributor deciding what to run before a commit, and for anyone who wants to
know what CI does and does not cover.

## The layers

| Layer                          | Command                                   | What it proves                                                                       | Runs in CI                                    |
| ------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------- |
| Architecture check             | `npm run architecture`                    | The dependency rules and walls hold                                                  | Yes                                           |
| Architecture check's own tests | `npm run test:architecture`               | The architecture check can fail                                                      | Yes                                           |
| Rust unit tests                | `cargo test --workspace`                  | Crate behaviour, including resolvers against loopback servers                        | Yes (`opys-runtime` also on Windows)          |
| JS unit tests                  | `npm test`                                | What the TypeScript wrappers add                                                     | Yes                                           |
| Typecheck                      | `npm run typecheck`                       | Types, including test code                                                           | Yes                                           |
| napi smoke test                | `node scripts/smoke-napi.mjs`             | Every binding loads and crosses into Rust once                                       | No                                            |
| Live integration               | `npm run test:int`                        | The real Mojang, Forge, Modrinth, CurseForge and Java vendor APIs answer as expected | No                                            |
| Docs examples                  | `cd docs && npm run examples`             | Every config shown in the docs builds                                                | Only on a push to `main` that changes `docs/` |
| Launch matrix                  | `node run.mjs` in `scripts/launch-matrix` | A built manifest installs, launches and shows a game window                          | No (by hand only)                             |

Run the first layers before every commit. The later ones need the network, a
display or a long time, and are run when the change touches what they guard.
The pre-commit hook formats staged TypeScript, JavaScript and Markdown with
prettier, runs the architecture check and, when a `.rs` file is staged, runs
`cargo clippy`. It does not run `cargo fmt`, which CI checks.

Build the packages once before anything that loads them. `npm run build` at the
repository root builds every TypeScript package and every napi binding. A
binding build writes a `.node` file and an `index.js` into its `crates/*-napi`
directory, which the smoke test loads directly.

## Architecture check

```sh
npm run architecture        # node scripts/check-architecture.mjs
npm run test:architecture   # node --test scripts/architecture/checks.test.mjs scripts/release/order.test.mjs
```

`npm run architecture` holds the tree to the boundaries written as data in
`scripts/architecture/rules.mjs`. It reads manifests and sources only, so it
needs nothing built. It checks the dependency graph between crates and
packages, the walls that keep the build side and the runtime apart, one napi
binding per crate, and that every import is declared in a `package.json`. It
also checks the two lists still kept by hand, the root `workspaces` and the
smoke test, and that the release workflow still derives the rest. The rules are
allow-lists: a crate or package the file does not name fails the check, so an
intentional change to the architecture is an edit to `rules.mjs`.
[Architecture](/internals/architecture) describes what it holds.

`npm run test:architecture` runs the tests for the check itself, and for the
crates.io publish-order code in `scripts/release/order.mjs`. Each architecture
test builds a small, sound world by hand and breaks it one rule at a time, to
show that each rule can fail. A check that cannot fail checks nothing, so change
the check and this suite together.

## Rust unit tests

```sh
cargo test --workspace
```

Each crate tests its own behaviour in its `src` modules and in `tests/`. A
resolver is split into a pure part and one network call, so most of what it
does is tested with plain inputs. The network call is tested against a
loopback server, not a mock. The pattern is in
`crates/opys-java/tests/common/mod.rs`: it binds a listener to `127.0.0.1` on
an ephemeral port and points the resolver's `apiBase` at it. The other resolver
crates have the same helper.

Behaviour ported from one crate into another is tested where it now lives, not
twice: `@opys/java`'s JavaScript tests cover only the plugin closure and the
typed surface, and the resolvers are tested in `crates/opys-java/tests`.

`opys-forge`, `opys-neoforge`, `opys-cleanroom` and `opys-lwjgl3ify` each have
one test that is ignored by default: `tests/documents.rs` parses every
published document of that family. Point `OPYS_FORGE_DOCUMENTS` (or
`OPYS_NEOFORGE_DOCUMENTS`, `OPYS_CLEANROOM_DOCUMENTS`,
`OPYS_LWJGL3IFY_DOCUMENTS`) at a local copy of the site's `versions/` tree and run
`cargo test -p opys-forge --test documents -- --ignored`. Re-run it whenever the
generator's output or `VersionPatch` changes.

## JS unit tests and typecheck

```sh
npm test
npm run typecheck
```

`npm test` runs `vitest run tests/unit` in every workspace that defines a `test`
script. The suites cover only what a TypeScript package adds on top of its
crate: the plugin closures, the config loader, the typed surface. Logic that
lives in Rust is tested in Rust. The standing coverage bar is about 99% of
lines. No script in `package.json` enforces it, and `@vitest/coverage-v8` is
installed for measuring it.

`npm run typecheck` runs `tsc --noEmit -p tsconfig.json` in every package. Every
`tsconfig.json` includes `tests/**/*.ts` as well as `lib/`, except the one in
`@opys/mojang-rules`, which is types only and has no tests. A type error in a
test fails the same command as one in the library.

## napi smoke test

```sh
node scripts/smoke-napi.mjs
```

Run it after `npm run build`. The script loads every binding's `index.js`
directly from its `crates/*-napi` directory and calls into it: core decode and
encode, the Mojang parsers, the dev engine's merge, each plugin crate's
resolver, and the runtime's install of a small bundle into a temporary
directory. Where a call would reach the network, the script starts a loopback
server in place of the service: Adoptium, the Mojang endpoints, the Fabric,
Forge, NeoForge, Cleanroom and lwjgl3ify indexes, GitLab, Modrinth, CurseForge
and the GitHub releases API.

It prints `result: N passed, M failed`, and exits 1 if any check failed.

## Live integration

```sh
CURSEFORGE_TOKEN=... npm run test:int
```

This runs `vitest run tests/integration` in each workspace that defines a
`test:int` script: `@opys/cli`, `@opys/mojang`, `@opys/java` and
`@opys/minecraft`. The suites call the real Mojang, Forge, Modrinth,
CurseForge, Adoptium, Azul and GitHub services, so they need network access.

The CurseForge tests need an API key in the `CURSEFORGE_TOKEN` environment
variable. In `packages/minecraft/tests/integration/plugins.test.ts` those
blocks are skipped when the variable is unset, and the rest of the suite still
runs. The docs examples check reads the variable too.

CI never runs these tests. They depend on services outside the repository, so a
failure says nothing certain about the code.

## Docs examples

```sh
cd docs && npm run examples
```

This runs `docs/check-examples.mjs`, which builds every
`docs/examples/<name>/opys.config.mjs` with the built CLI. A page includes an
example by reference, so a page cannot show a config that does not build. The
script needs the packages built (`npm run build` at the root) and network
access, because a build resolves real versions. An example whose name contains
`curseforge` is skipped, with a message, when `CURSEFORGE_TOKEN` is unset.

The `examples` job in `.github/workflows/docs.yml` runs the same script. That
workflow runs on a push to `main` that changes `docs/**` or the workflow file,
and on a manual dispatch. The job does not gate the site deploy: a red cell
means an example no longer resolves, not that the site is broken.

## The launch matrix

The matrix is the only check that a manifest runs. Everything above stops at a
manifest that resolves. For each case it builds a bundle, installs it, launches
the game cold, then launches it again warm, and passes the case when both
launches show a game window and the game is still running.

It runs by hand, locally or through a `workflow_dispatch` workflow, and never
on a push or on a schedule. A case downloads up to a gigabyte, and what it
guards (the published version documents and horno) changes without a commit
here. Run it after a horno release, or after a change to a loader crate, the
runtime or horno. A red run is as likely to be a change upstream as a bug here,
so read the screenshot and the log before you blame the code.

### The case lists

`scripts/launch-matrix/gen-cases.mjs` writes three lists from the live Forge
and NeoForge indexes and from Fabric's meta service. The lists are gitignored,
so run the generator before `run.mjs`. The workflow does it on every run.

| File               | Cases | Contents                                                                                                                                                                                                                                              |
| ------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cases.slice.json` | 12    | What the workflow runs by default: Forge 1.7.10, 1.12.2, 1.16.5, 1.20.1 and 1.21.1, the newest Forge, Forge 1.20.2 and 26.1 (the two builds that break first on a new Java), NeoForge 1.21.1, the newest NeoForge, and the newest Fabric and vanilla. |
| `cases.json`       | 39    | The key set: a spread of Minecraft versions per loader, Cleanroom and lwjgl3ify, and three vanilla cases on other vendors (Zulu and GraalVM).                                                                                                         |
| `cases.full.json`  | 134   | The key set, plus every Minecraft version the Forge and NeoForge indexes publish.                                                                                                                                                                     |

The counts are from the last time the generator ran, and change as the indexes
change. The generator picks Java per case from the version, and pins two Forge
builds to a Java they can start on: Forge 1.7.2 to Java 7 (Zulu) and Forge
1.16.4 to `8u312-b07`. A case id has the form `<loader>-<version>-j<java>`, with
`-<vendor>` added when a vendor is set, for example `forge-1.16.5-j8`.

### Running it

```sh
npm run build                         # the matrix drives packages/cli/dist
cd scripts/launch-matrix
node gen-cases.mjs                    # writes the three lists
node run.mjs                          # cases.json, the key set
node run.mjs --cases cases.full.json  # every version Forge and NeoForge publish
node run.mjs --cases cases.slice.json --only forge-1.20.1
```

`run.mjs` takes these flags:

| Flag                 | Default      | Effect                                                                                  |
| -------------------- | ------------ | --------------------------------------------------------------------------------------- |
| `--cases <file>`     | `cases.json` | The list to run                                                                         |
| `--only <substr>`    | all cases    | Run only the cases whose id contains the text                                           |
| `--force`            | off          | Run a case again even if `work/<id>/result.json` exists                                 |
| `--keep`             | off          | Keep the installation of a passing case. A failing case is always kept                  |
| `--no-pool`          | pool on      | Do not seed each case from the shared download pool                                     |
| `--budget <minutes>` | 30           | How long a cold launch may take to show a window. A warm launch gets at most 10 minutes |

It also reads two environment variables. `MATRIX_STAGE=xvfb` selects the Xvfb
stage described below. `MATRIX_DISPLAY_BASE` (default 90) is the first display
number the Xvfb stage uses. On a desktop the games are audible; set
`ALSOFT_DRIVERS=null` to give OpenAL a backend that plays nothing.

A case that already has a `result.json` is skipped, so a run can be resumed.
The run exits 1 if any case failed.

### What a launch does

A case builds `case.opys` with `opys build`, from one shared config,
`matrix.config.mjs`, which takes the loader, version and Java from environment
variables. A build failure fails the case, and nothing is launched. Otherwise
the runner launches the bundle with fixed vars (`username=Player`, a fixed UUID,
`token=0`) and a `root` inside the case directory, first cold and then warm. The
warm launch runs only if the cold one passed.

Each launch is judged in three steps:

1. The runner polls for a game window until the budget runs out, or until the
   launch process exits.
2. Once a window appears, it waits up to 90 seconds for a line in the log that
   shows the game has started its sound engine, built its texture atlas or
   loaded Forge, and 12 seconds more after that line. If the line never
   appears, it checks after the 90 seconds.
3. It takes a screenshot if the window is still there. The launch passes when
   the window still exists, the process is still alive, and the log has no
   fatal line. The fatal patterns include `Exception in thread "main"`, `Game
crashed` and `Could not find or load main class`.

A pass is therefore a window and a live process, and it goes no further. A
loader's error screen satisfies it, which is why the screenshot is worth
opening. The runner sends the game no input, so the game is judged on what it
shows by itself, in practice the title screen.

The result of each case goes to `work/<id>/result.json`, and the whole run to
`work/summary.json`. The directory also holds `case.opys`, `build.log`,
`cold.log`, `warm.log`, and a `cold.png` and `warm.png` when a window was seen.

### The pool

Before installing a case, the runner hard-links into it any download that a
case before it already fetched, from `scripts/launch-matrix/pool`. Only files a
manifest names as a pinned download are pooled. Files a loader's processors
produce are never pooled, and the installer still scans and verifies each one.
`--no-pool` turns this off, which is the more honest run when the network
allows it. The workflow passes `--no-pool`.

### The two stages

**Hyprland (the default).** On a desktop running Hyprland, the runner creates a
headless monitor named `opys-headless` if one does not exist, puts a workspace
on it, and adds window rules that send game windows there. Games render on the
real GPU and never appear on the screen in use. Screenshots are taken with
`grim`. Remove the monitor afterwards with `hyprctl output remove
opys-headless`.

**Xvfb (`MATRIX_STAGE=xvfb`).** For a machine with no desktop. Each launch gets
its own Xvfb display, numbered from `MATRIX_DISPLAY_BASE`, at 1280x720 with GLX
and RANDR. The launch runs with `LIBGL_ALWAYS_SOFTWARE=1` for software GL, and
`SDL_VIDEO_FORCE_EGL=1`, because 26.3 opens its window through SDL, which needs
EGL on this display. A window counts when it is at least 300x200 and viewable.
Screenshots are taken with ImageMagick's `import`.

`scripts/launch-matrix/Dockerfile` is an image with everything the Xvfb stage
needs. Build it, mount the repository at `/work`, and inside the container run
`mkdir -p ~/.local/share && npm ci && npm run build` (lwjgl3ify will not start
without that directory), then `MATRIX_STAGE=xvfb node run.mjs` in
`scripts/launch-matrix`. Several runners can share one `work/` directory if
their lists do not overlap; give each its own `MATRIX_DISPLAY_BASE`.

### The workflow

`.github/workflows/launch-matrix.yml` runs on `workflow_dispatch` only. It has
two inputs:

| Input   | Default | Effect                                                                         |
| ------- | ------- | ------------------------------------------------------------------------------ |
| `cases` | `slice` | Which list to run: `slice`, `key` (`cases.json`) or `full` (`cases.full.json`) |
| `only`  | empty   | Run only the cases whose id contains this text                                 |

The job runs on `ubuntu-latest` with the Xvfb stage. It regenerates the lists,
then runs `node run.mjs --cases <list> --no-pool --budget 10`, with `--only`
when `only` is set. Its budget is 10 minutes, not the 30 of the local default.
It uploads the logs, screenshots, per-case results and `summary.json` as an
artifact kept for 14 days. The job has a 300-minute timeout, and a
`launch-matrix` concurrency group that does not cancel a run in progress.

## What CI runs on a push

`.github/workflows/ci.yml` runs on a push to `main` and on a pull request into
`main`. It has four jobs.

| Job                         | Runs                                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture boundaries     | `npm run test:architecture`, `npm run architecture`, `node scripts/release/crates.mjs` (checks that the crates publish in a resolvable order)                         |
| Cargo build + test          | `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, `cargo build --workspace --locked`, `cargo test --workspace --locked` |
| Cargo test (Windows)        | `cargo test -p opys-runtime --locked`                                                                                                                                 |
| TS build + typecheck + test | After the Cargo job: builds `@opys/core-binding` and `@opys/runtime-binding`, then `npm run build` for all workspaces, `npm run typecheck`, `npm test`                |

The Windows job runs only the runtime crate: its sweep and extract code
branches on `\` against `/` and case-folds on Windows, which only a real
Windows filesystem walk exercises.

## What is not covered

- **Windows and macOS launches.** Nothing starts a game on Windows or macOS.
  The Windows job runs one Rust crate's tests, and there is no macOS test job.
- **Anything past the window.** The matrix proves that a game opens a window
  and stays up. It does not play, join a server, or check what the game shows
  beyond its log.

## horno

horno, the Java jar that a loader's installer runs, is a separate repository
(`../horno` from this one), and its tests are its own.

```sh
./gradlew build                         # in the horno repository
jdk-probe/run.sh build/libs/<horno jar> # the shaded jar, not the -sources one
```

`./gradlew build` runs the JUnit 5 suites under `src/test/java`, which cover the
version and download code and the patch, install and profile steps. Its CI job
(`build.yml` in horno) builds with Java 8.0.312 and uploads the shaded jar.

`jdk-probe/run.sh` asks the JDK on `PATH` (or `$JAVA_HOME`) the questions that
horno's `ModuleUtil` relies on, described under JDK internals in
[horno](/internals/horno), and exits non-zero on the first wrong answer. It is
the only thing that reports a JDK that has moved them. horno's CI runs it on
Java 17, 21, 25 and 27 as the `jdk-internals` job.

To try a locally built horno against a real installation, run a case with
`--keep`, then swap the jar in. Run both in `scripts/launch-matrix`:

```sh
node run.mjs --only forge-1.16.5 --keep
node probe.mjs forge-1.16.5-j8 <path to the built horno jar>
```
