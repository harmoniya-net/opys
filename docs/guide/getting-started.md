# Getting started

This page takes you from nothing to a running game, then to a Forge pack. It
assumes Node.js 20 or newer and nothing else: opys downloads Java itself.

## Install

```sh
npm install -g @opys/cli
mkdir my-pack && cd my-pack
npm init -y
npm install -D @opys/dev @opys/minecraft
```

The `opys` command is global, but your config is an ordinary JavaScript module
and its imports resolve from your project. That is why the two packages are
installed locally, the same way a Vite config finds its plugins.

## Write a config

Create `opys.config.mjs`:

<<< @/examples/vanilla/opys.config.mjs

Three parts are worth a first look:

- **`plugins`** say what the installation is made of. `minecraft('1.21.1')`
  contributes the game, its libraries and its assets; `java('21')` contributes
  a Java runtime for whatever machine installs it.
- **`manifest`** says how to start it. Each plugin hands back the pieces it
  owns, and you put them in order: the Java binary, then the JVM arguments,
  the main class and the game arguments.
- **`runClient`** supplies what only the launching machine knows: where to
  install, and who is playing. See [Launch-time values](./run-client).

## Launch it

```sh
opys launch
```

The first run downloads about a gigabyte: the game, its assets and a JDK.
Later runs hash the files already on disk and fetch only what is missing or
changed.

Everything lands in the directory `userDataDir('my-pack')` names:
`~/.local/share/my-pack` on Linux, `%APPDATA%\my-pack` on Windows,
`~/Library/Application Support/my-pack` on macOS. Delete it to start over.

::: tip Playing offline
`token: '0'` starts the game without a Microsoft account, which is enough for
single-player and offline-mode servers. To sign players in, see
[Accounts, servers, GPUs](./extras).
:::

## Make it a Forge pack

Swap the loader, and match the Java version to it:

<<< @/examples/forge/opys.config.mjs{2,6,9}

`forge('1.20.1')` picks the build the Forge index marks best for that
Minecraft version: the recommended one if there is one, the latest otherwise.
The arguments now come from `forge`, because the loader decides how the game
starts. NeoForge, Fabric and the others work the same way; see
[Loaders](./loaders).

To add mods, drop them in a `mods` folder next to the config and add one
plugin:

```js
import { files } from '@opys/dev';

// ...
plugins: [
  forge('1.20.1'),
  java('17'),
  files({ from: 'mods', to: '${game_directory}/mods/${rel}' }),
],
```

Each file in `mods` is installed under the game's `mods` directory. In a
built bundle the files travel inside it, so nothing else needs hosting.

Or name them where they are published, on Modrinth or CurseForge, and let opys
pin each file: see [Mods and files](./mods).

## Build something to share

```sh
opys build
```

This writes `game.opys`, a single file that describes the whole installation.
Anyone with opys can run it without your config or your project:

```sh
opys launch game.opys --var root=/path/to/install --var username=Player \
  --var uuid=00000000-0000-0000-0000-000000000001 --var token=0
```

A bundle has no `runClient`, since that is code and a bundle is data, so the
machine-specific values come from `--var`. A launcher you write yourself
passes them the same way: see [Embedding the runtime](/launcher/embedding).

## Where to go next

- [Concepts](./concepts) explains the manifest, the bundle and why a config
  has two halves. Read it before writing anything larger.
- [The config file](./config) covers every field.
- [Publishing a bundle](./publishing) covers hosting one and updating players.
