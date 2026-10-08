# Publishing a bundle

This page covers what happens after `opys build`: what the file holds, how you
host it, how players get each update, and what must stay out of it. It is for
a pack author. The launcher side is in
[Embedding the runtime](/launcher/embedding).

## Build the bundle

```sh
opys build
```

This reads `opys.config.mjs`, runs every plugin, and writes the file named by
`output` (`game.opys` in the examples). A relative `output` is resolved from the
config file's directory. `-o` overrides it, and a relative `-o` is resolved the
same way. The last line says what was written:

```text
Written to game.opys (<artifacts> artifact(s), <blobs> blob(s))
```

With no output named anywhere, `opys build` prints the manifest as JSON
instead. That is a view for reading and diffing. It leaves out the blobs, so it
is not something to install from.

A bundle is a zip with three kinds of entry:

| Entry            | Holds                                                                         |
| ---------------- | ----------------------------------------------------------------------------- |
| `opys.json`      | The head: `format`, `vars`, `launch`, `restrict`. Stored first, uncompressed. |
| `artifacts.json` | The artifact list: one entry per file the installation places.                |
| `blobs/<sha256>` | One entry per carried file, named by the hash of its bytes.                   |

The exact layout is in [the bundle format](/reference/bundle-format). Because it
is a plain zip, `unzip -l game.opys` lists it, and `unzip -p game.opys opys.json`
prints the head.

## The build is deterministic

Two builds of the same config produce the same bytes. The writer gives every
entry the same timestamp and mode, writes the blobs in id order, and hashes each
blob against its name as it writes it.

That guarantee covers the writer, not the plugins. A plugin that resolves a
moving target at build time, such as `forge('1.20.1')` picking the best build
published that day, can produce a different manifest on a later build. That
difference is how an update reaches players.

## Host it on any static server

A bundle is one file, so any server that answers a GET with the bytes will do.
The runtime treats a non-2xx response as a failure. A launcher that embeds
`@opys/runtime` takes the URL directly:

```ts
import { launch } from '@opys/runtime';

const child = await launch(
  { url: 'https://example.com/packs/game.opys' },
  {
    vars: {
      root: '/home/player/.my-pack',
      username: 'Player',
      uuid: '00000000-0000-0000-0000-000000000001',
      token: '0',
    },
  },
);
```

A `url` source is downloaded whole, into a temporary file, before anything is
installed from it. It is downloaded again every time the source is resolved.

The `opys` command does not take a URL. `opys launch` reads a bundle from a
path, so a player who uses the command line downloads the file first:

```sh
curl -fLO https://example.com/packs/game.opys
opys launch game.opys --var root=$HOME/.my-pack --var username=Player \
  --var uuid=00000000-0000-0000-0000-000000000001 --var token=0
```

::: warning The loader's install step
When a bundle's launch arguments name horno, the loader's processors have to run
once on the player's machine. horno does that as part of the game's command
line, so starting the game is enough. `install()` in `@opys/runtime` only
places files; a launcher that wants the processors done before the player
presses play has to run that step itself, as `opys install` does.
[Install and launch](/launcher/embedding#loader-install-steps) says how.
:::

## Updates

To update a pack, rebuild and replace the file at the same URL. The next time a
player's launcher resolves the bundle, it does this:

1. Downloads the new bundle whole.
2. For each artifact, hashes the file already on disk. A file that still matches
   its hash is skipped. A file that is missing or changed is fetched into
   `<path>.partial` and renamed into place.
3. Checks the files it fetched against their hashes.
4. Extracts every archive artifact. Extraction runs on every install, so the
   extracted files always match the manifest.
5. Runs the sweep, if the bundle has `restrict` (see below).

An artifact with no hash is never re-fetched once its file exists. Every
artifact `files` and `links` produce has a hash, so this matters only for
artifacts you write by hand without one.

### Removing files: `restrict`

The sweep does not remove everything the new manifest left out. It deletes only
files that match a `restrict` glob. A file that no glob covers stays where it is.

```js
manifest: {
  // ...
  restrict: ['${game_directory}/mods/*.jar'],
},
```

The sweep works like this:

- Each glob is interpolated with the install-time vars, so `${game_directory}`
  is built from the `root` the launching machine gave.
- The directory swept is the glob's path up to the last `/` before its first
  wildcard (`*`, `?`, `{` or `[`). A glob with no such directory, such as
  `*.jar`, sweeps nothing.
- Every file under that directory that matches the glob, and is not an artifact
  of this manifest, is deleted. `*` and `?` match within one directory level,
  `**` matches across levels, and `{a,b}` chooses between alternatives, so the
  glob above leaves a jar in a subfolder of `mods/` alone.
- Every empty subdirectory under that directory is then removed, whether or not
  the glob matched anything in it.

::: warning Spell the glob like the artifact paths
The sweep compares paths as strings once their variables are filled in.
`game_directory` is `${root}/`, with a trailing slash, so
`${game_directory}/mods/a.jar` becomes `…/root//mods/a.jar` and
`${root}/mods/a.jar` becomes `…/root/mods/a.jar`. They name the same file and
are different strings. A glob written with one spelling does not recognise an
artifact written with the other, and sweeps the artifact as a stray. Use the
same variable in `restrict` as in the artifact paths it protects.
:::

The sweep runs last, after extraction, and only when the install reached it.
Two consequences follow from that. A `restrict` glob must not cover the place an
`extract` rule writes to: the sweep does not know about files an archive put
there, so it would delete what the extraction just wrote. And a mod removed from
`mods/` is deleted on the player's next install only if a glob names `mods/`.

## Build variants with `--mode`

`--mode` sets the `mode` the config function receives. It is what tells a dev
build from a production one:

```js
export default defineConfig(({ mode }) => {
  const dev = mode === 'dev';
  return {
    output: dev ? 'game-dev.opys' : 'game.opys',
    plugins: [
      forge('1.20.1'),
      java('17'),
      ...(dev
        ? [files({ from: 'dev-mods', to: '${game_directory}/mods/${rel}' })]
        : []),
    ],
    manifest: {
      // ... the same as the production config
    },
  };
});
```

```sh
opys build --mode dev          # writes game-dev.opys
opys build                     # writes game.opys
```

When `--mode` is not given, `mode` is the command's name: `build`, `install` or
`launch`. It is never an empty string. Compare with `mode === 'dev'`, as above,
so the default lands on the production branch.

`opys launch --mode dev` builds the variant in memory and launches it. A bundle
has no config, so `opys launch game.opys` has no mode to choose.

## What stays out of a bundle

A bundle is data, and anyone who has the file can read all of it. Keep the
following out.

| Do not put in                                                          | Put it in                         | Why                                                                                                    |
| ---------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Paths from the build machine, such as `userDataDir()` or `/home/you/…` | `runClient`, or `--var` at launch | The bundle is the same for every player, so your path would reach them all.                            |
| A username, UUID or access token                                       | `runClient`, or `--var` at launch | The values are supplied on the launching machine, each time it starts.                                 |
| Keys or passwords of any kind                                          | Nowhere in the bundle             | `manifest.vars`, `command`, `args`, `envs` and `restrict` are all in `opys.json`, which is plain text. |
| Secret files passed through `files`                                    | Nowhere in the bundle             | A carried file is a deflated zip entry. `unzip` extracts it for anyone.                                |

Values from `--var` are never written into the bundle. They are applied on the
launching machine only.

## Carried files or hosted files

`files({ from, to })` with no `url` carries each file in the bundle. With a
`url`, each file is pointed at a copy you host, and pinned by its hash:

```js
files({ from: 'mods', to: '${game_directory}/mods/${rel}' }); // carried
files({
  from: 'mods',
  to: '${game_directory}/mods/${rel}',
  url: 'https://cdn.example.com/mods/${rel}',
}); // hosted, pinned by sha1
```

The choice changes the size of the bundle and the cost of an update:

|                                                                   | Carried (no `url`)                                                                | Hosted (`url`)                                                              |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Bundle size                                                       | Grows by the size of each file                                                    | One line per file in `artifacts.json`                                       |
| Hosting                                                           | The bundle alone                                                                  | Each file at its URL, kept up for as long as players need it                |
| Cost on every launch, when the launcher is given the bundle's URL | The whole bundle is downloaded, carried files included, even when nothing changed | Only the bundle; a changed file is fetched, an unchanged one is only hashed |
| Pinned by                                                         | The sha256 in its blob name                                                       | `hash: 'sha1'` (the default) or `'sha256'`                                  |

Carried files are the easy choice. Nothing else needs a server to stay up, and
nothing can go stale. Hosting them pays off when the files are large and change
rarely, because players download only the ones that changed. Mods from Modrinth
and CurseForge are better named with [`modrinth`](/plugins/modrinth) and
[`curseforge`](/plugins/curseforge), which pin them without copying them
anywhere; see [Mods and files](./mods).

::: tip Check the size before you publish
`ls -l game.opys` shows what players will download on every launch. If it is
larger than you expected, the cause is almost always a carried file that could
be hosted.
:::
