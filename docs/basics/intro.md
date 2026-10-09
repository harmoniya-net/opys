# Introduction

opys turns a short config file into a Minecraft installation that installs
and launches the same way on every machine.

You describe the pack once: loader, Java, mods. opys works out every file
the game needs and pins each one by hash.

## The idea in four lines

- A **config** lists **plugins**: `forge`, `java`, `modrinth`.
- `opys build` runs them and writes a **bundle**: one file describing the
  whole installation.
- A **launcher** (or `opys launch`) installs the bundle and starts the game.
- Paths and accounts are filled in on the player's machine, never baked in.

## Try it

You need Node.js 20 or newer. You do not need Java: opys downloads it.

```sh
npm install -g @opys/cli
mkdir my-pack && cd my-pack
npm init -y
npm install -D @opys/dev @opys/minecraft
```

Create `opys.config.mjs`:

<<< @/examples/basics-intro/opys.config.mjs

Then:

```sh
opys launch
```

The first run downloads about a gigabyte. Later runs fetch only what
changed.

::: tip Where did it install?
Into `userDataDir('my-pack')`: `~/.local/share/my-pack` on Linux,
`%APPDATA%\my-pack` on Windows, `~/Library/Application Support/my-pack` on
macOS. Delete the folder to start over.
:::

## What you just wrote

| Part       | Says                                                           |
| ---------- | -------------------------------------------------------------- |
| `plugins`  | What the pack is made of: Forge, and a Java to run it.         |
| `manifest` | How to start the game. `'@forge.…'` are pieces Forge provides. |
| `run`      | What only the player's machine knows: where, and who.          |

`token: '0'` plays offline, with no Microsoft account.

## Add mods

Put jars in a `mods/` folder next to the config and add one plugin:

```js
import { defineConfig, files, userDataDir } from '@opys/dev';

// ...
plugins: [
  forge({ version: '1.20.1' }),
  java({ version: '17' }),
  files({ from: 'mods', to: (file) => '${game_directory}/mods/' + file.rel }),
],
```

Mods on Modrinth or CurseForge can be named instead of downloaded by hand.
See [Plugins](/plugins/).

## Share it

```sh
opys build
```

This writes `game.opys`. Anyone with opys can launch it, without your
project:

```sh
opys launch game.opys --var root=/path/to/install --var username=Player \
  --var uuid=00000000-0000-0000-0000-000000000001 --var token=0
```

`--var` does what `run` did. `run` is code and stays in your project. The
bundle is data.

## Next

- [The config](./config): every feature, with when and why to use it.
- [The bundle](./bundle): what `game.opys` is and how to ship it.
- [The CLI](./cli) and [Launcher integration](./launcher).
