# opys

Describe a Minecraft installation in a short config file. opys turns it into
one file that installs and launches the game on any machine.

- **For pack makers.** Pick a loader, a Java version and your mods. opys
  works out every file the game needs and pins each one by hash, so players
  get exactly what you built.
- **For launcher authors.** A small runtime installs a pack and starts the
  game, with progress and typed errors.
- **Every loader.** Vanilla, Forge from 1.1 on, NeoForge, Fabric, Cleanroom
  and lwjgl3ify.

**Documentation: [harmoniya-net.github.io/opys](https://harmoniya-net.github.io/opys/)** (English), [harmoniya-net.github.io/opys/uk](https://harmoniya-net.github.io/opys/uk/) (Ukrainian)

## Quick start

You need Node.js 20 or newer. You do not need Java: opys downloads it.

```sh
npm install -g @opys/cli
mkdir my-pack && cd my-pack
npm init -y
npm install -D @opys/dev @opys/minecraft
```

Put this in `opys.config.mjs`:

```js
import { defineConfig, userDataDir } from '@opys/dev';
import { forge, java } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  // What the installation is made of.
  plugins: [forge({ version: '1.20.1' }), java({ version: '17' })],
  // How to start it. '@forge.jvmArgs' is what the forge plugin worked out.
  manifest: {
    command: '@forge.command',
    args: ['@forge.jvmArgs', '-Xmx4G', '@forge.mainClass', '@forge.gameArgs'],
    workdir: '${game_directory}',
  },
  // What only the player's machine knows.
  run: (manifest) => ({
    manifest: {
      vars: {
        ...manifest.vars,
        root: userDataDir('my-pack'),
        username: 'Player',
        uuid: '00000000-0000-0000-0000-000000000001',
        token: '0',
      },
    },
  }),
});
```

```sh
opys launch   # install and play
opys build    # write game.opys, one file anyone with opys can launch
```

The first launch downloads about a gigabyte: the game, its assets and a JDK.

## How it works

A config lists **plugins**. Each one works out part of the installation at
build time: which files, from where, with which hash. The result is a
**manifest** in which nothing is left to look up, published as a **bundle**, a
plain zip. Installing one is then only downloading, checking and unpacking.

Paths and accounts differ per player, so they are never baked in. The bundle
uses variables such as `${root}`, and the launching machine fills them in.

More: [The config](https://harmoniya-net.github.io/opys/basics/config) and
[The bundle](https://harmoniya-net.github.io/opys/basics/bundle).

## Packages

| Package                                                       | Description                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`@opys/cli`](packages/cli)                                   | The `opys` command: build, install and launch                             |
| [`@opys/dev`](packages/dev)                                   | Build SDK: `defineConfig`, the build engine, the plugin contract, `files` |
| [`@opys/core`](packages/core)                                 | The manifest data model; the reference implementation of the format       |
| [`@opys/bundle`](packages/bundle)                             | The bundle: reads and writes the file a manifest is published as          |
| [`@opys/runtime`](packages/runtime)                           | Installs a manifest and starts its game, for a launcher you write         |
| [`@opys/minecraft`](packages/minecraft)                       | Meta-package: re-exports the plugins below in one import                  |
| [`@opys/minecraft-vanilla`](packages/minecraft-vanilla)       | The `minecraft` plugin, and the version JSON mapping every loader shares  |
| [`@opys/forge`](packages/forge)                               | Forge, for every Minecraft version in its index from 1.1 on               |
| [`@opys/neoforge`](packages/neoforge)                         | NeoForge, for every Minecraft version in its index from 1.20.2 on         |
| [`@opys/fabric`](packages/fabric)                             | Fabric                                                                    |
| [`@opys/cleanroom`](packages/cleanroom)                       | Cleanroom, a successor to Forge for 1.12.2 on a modern Java               |
| [`@opys/lwjgl3ify`](packages/lwjgl3ify)                       | lwjgl3ify: Forge 1.7.10 on LWJGL 3 and a modern Java                      |
| [`@opys/java`](packages/java)                                 | A Java runtime for each platform                                          |
| [`@opys/modrinth`](packages/modrinth)                         | Mods and modpacks from Modrinth                                           |
| [`@opys/curseforge`](packages/curseforge)                     | Mods and modpacks from CurseForge                                         |
| [`@opys/links`](packages/links)                               | Any published file, from a pasted link, as a pinned artifact              |
| [`@opys/authliberty`](packages/authliberty)                   | Signs players in against your own auth server                             |
| [`@opys/bifrost`](packages/bifrost)                           | Mints a signed session token at launch, for `run`                         |
| [`@opys/minecraft-serverlist`](packages/minecraft-serverlist) | Pre-fills the multiplayer server list                                     |
| [`@opys/minecraft-server`](packages/minecraft-server)         | A Minecraft server: vanilla, Paper, Purpur, Fabric, Forge or NeoForge     |
| [`@opys/dgpuj`](packages/dgpuj)                               | Starts the game on the discrete GPU                                       |
| [`@opys/mojang`](packages/mojang)                             | Parsers for Mojang's formats, and the strict rule evaluator               |
| [`@opys/mojang-rules`](packages/mojang-rules)                 | The types of Mojang's rule format                                         |

## Development

Most of opys is Rust (`crates/`), with a thin TypeScript package over each
crate (`packages/`).

```sh
npm run build            # every addon and package
npm test                 # JavaScript unit tests
cargo test --workspace   # Rust tests
npm run architecture     # checks the dependency rules
cd docs && npm run dev   # the documentation site
```

[How opys is built](https://harmoniya-net.github.io/opys/reference/architecture)
is the map for contributors, and [`CLAUDE.md`](CLAUDE.md) is the full record
of the architecture and the reasons behind it.
