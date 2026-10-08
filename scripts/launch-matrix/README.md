# The launch matrix

Builds a bundle for each case, installs and launches it — cold, then warm —
and passes the case when the game owns a window and is still alive once it
has settled. This is the check that a manifest _runs_, which nothing else in
the repository makes: the unit suites and `test:int` stop at a manifest that
resolves.

It is not part of CI. A case downloads up to a gigabyte and starts a game.

```sh
npm run build                         # the matrix drives packages/cli/dist
cd scripts/launch-matrix
node gen-cases.mjs                    # cases.json (key set), cases.full.json
node run.mjs                          # the key set
node run.mjs --cases cases.full.json  # every Minecraft version Forge and NeoForge publish
```

Each case leaves `work/<id>/`: `case.opys`, `build.log`, `cold.log`,
`warm.log`, a screenshot of each launch, and `result.json`. A case that
already has a result is skipped; `--force` runs it again, `--only <substr>`
narrows the list, and `--keep` keeps the installation of a passing case
(a failing one is always kept).

A screenshot is the evidence worth looking at. A pass means a window and a
live process, which a loader's error screen also satisfies.

## Where the window goes

- **A desktop running Hyprland** (the default). Games go to a headless
  monitor the runner creates, so they render on the real GPU and never
  appear on the screen in use. `hyprctl output remove opys-headless` takes
  it away afterwards.
- **A machine with no desktop**: `MATRIX_STAGE=xvfb`, one Xvfb display per
  launch and software GL. `Dockerfile` is an image with everything that
  needs — build it, mount the repository at `/work`, build opys inside it,
  and run the matrix there:

  ```sh
  docker build -t opys-matrix scripts/launch-matrix
  docker run -d --name opys-matrix --cpus=10 --memory=14g --shm-size=1g \
    -v "$PWD":/work opys-matrix sleep infinity
  docker exec opys-matrix sh -c 'mkdir -p ~/.local/share && npm ci && npm run build'
  docker exec -e MATRIX_STAGE=xvfb opys-matrix \
    sh -c 'cd scripts/launch-matrix && node gen-cases.mjs && node run.mjs'
  ```

  `~/.local/share` is for lwjgl3ify, which will not start without it.
  Several runners can share a `work/` as long as their lists do not overlap;
  give each its own `MATRIX_DISPLAY_BASE`.

On a desktop the games are audible. `ALSOFT_DRIVERS=null node run.mjs` gives
OpenAL a backend that plays nothing; the game's sound engine starts all the
same.

## The pool

Downloads are slow on a slow link and identical between cases, so a file one
case has fetched is hard-linked into the next before it installs. Only files
a manifest names as a pinned download are pooled, never what a loader's
processors produce, and the installer still scans and verifies each one.
`--no-pool` turns it off, which is the more honest run where the network
allows it.

## Known exceptions

`gen-cases.mjs` pins two builds to a Java they can start on, because the
recommended Java 8 is too new for them: Forge 1.7.2 (Java 7) and Forge
for 1.16.4 (8u312). Forge for 1.5 and 1.5.1 does not
install at all — see horno's `TODO.md` — and shows an error dialog rather
than exiting, so those two cases run out their budget.

## Fixing horno against a real installation

`probe.mjs` launches an installed case once with a locally built horno
swapped in for the published jar:

```sh
node run.mjs --only forge-1.16.5 --keep
node probe.mjs forge-1.16.5-j8 ~/harmoniya/horno/build/libs/horno-0.1.0-LOCAL.jar
```
