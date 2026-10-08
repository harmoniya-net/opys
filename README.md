# opys

opys builds and launches Minecraft installations from a declarative manifest. A config file composes plugins (a loader, a Java runtime, mods) into the manifest at build time. The manifest is fully resolved: every artifact names one concrete source and, where one can be had, a hash, so an installer downloads and verifies and looks nothing up. `opys build` publishes it as a bundle, a single zip file, and `opys launch` installs and starts it. Values that belong to the launching machine, such as paths and the player's account, are supplied at launch and never baked into the bundle.

**Documentation: [harmoniya-net.github.io/opys](https://harmoniya-net.github.io/opys/)** (English), [harmoniya-net.github.io/opys/uk](https://harmoniya-net.github.io/opys/uk/) (Ukrainian)

## Quick start

```sh
npm install -g @opys/cli
mkdir my-pack && cd my-pack
npm init -y
npm install -D @opys/dev @opys/minecraft
```

Put this in `opys.config.mjs`, then run `opys launch`. The first run downloads about a gigabyte: the game, its assets and a JDK. `opys build` writes `game.opys` instead, one file that anyone with opys can launch.

```js
import { defineConfig, userDataDir } from '@opys/dev';
import { java, minecraft } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [minecraft('1.21.1'), java('21')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ minecraft }) => [
      minecraft.jvmArgs,
      minecraft.mainClass,
      minecraft.gameArgs,
    ],
    workdir: '${game_directory}',
  },
  runClient: (manifest) => ({
    vars: {
      ...manifest.vars,
      root: userDataDir('my-pack'),
      username: 'Player',
      uuid: '00000000-0000-0000-0000-000000000001',
      token: '0',
    },
  }),
});
```

## Packages

| Package                                                       | Description                                                                        |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`@opys/cli`](packages/cli)                                   | The `opys` command: build, install and launch                                      |
| [`@opys/dev`](packages/dev)                                   | Build SDK: `defineConfig`, the build engine, the plugin contract, `files`          |
| [`@opys/core`](packages/core)                                 | The manifest data model and the bundle; the reference implementation of the format |
| [`@opys/runtime`](packages/runtime)                           | Installs a manifest and starts its game, for a launcher you write                  |
| [`@opys/minecraft`](packages/minecraft)                       | Meta-package: re-exports the plugins below in one import                           |
| [`@opys/minecraft-vanilla`](packages/minecraft-vanilla)       | The `minecraft` plugin, and the version JSON mapping every loader shares           |
| [`@opys/forge`](packages/forge)                               | Forge, for every Minecraft version in its index from 1.1 on                        |
| [`@opys/neoforge`](packages/neoforge)                         | NeoForge, for every Minecraft version in its index from 1.20.2 on                  |
| [`@opys/fabric`](packages/fabric)                             | Fabric                                                                             |
| [`@opys/cleanroom`](packages/cleanroom)                       | Cleanroom, a successor to Forge for 1.12.2 on a modern Java                        |
| [`@opys/lwjgl3ify`](packages/lwjgl3ify)                       | lwjgl3ify: Forge 1.7.10 on LWJGL 3 and a modern Java                               |
| [`@opys/java`](packages/java)                                 | A Java runtime for each platform                                                   |
| [`@opys/modrinth`](packages/modrinth)                         | Mods and modpacks from Modrinth                                                    |
| [`@opys/curseforge`](packages/curseforge)                     | Mods and modpacks from CurseForge                                                  |
| [`@opys/link`](packages/link)                                 | Any published file, from a pasted link, as a pinned artifact                       |
| [`@opys/authliberty`](packages/authliberty)                   | Signs players in against your own auth server                                      |
| [`@opys/bifrost`](packages/bifrost)                           | Mints a signed session token at launch, for `runClient`                            |
| [`@opys/minecraft-serverlist`](packages/minecraft-serverlist) | Pre-fills the multiplayer server list                                              |
| [`@opys/dgpuj`](packages/dgpuj)                               | Starts the game on the discrete GPU                                                |
| [`@opys/mojang`](packages/mojang)                             | Parsers for Mojang's formats, and the strict rule evaluator                        |
| [`@opys/mojang-rules`](packages/mojang-rules)                 | The types of Mojang's rule format                                                  |

## Development

```sh
npm run build           # build every package
npm test                # unit suites
cd docs && npm run dev  # the documentation site
```

Also `npm run architecture` (holds the tree to `scripts/architecture/rules.mjs`), `npm run typecheck`, `npm run test:int` (live network, run locally only), `npm run test:architecture`, `npm run format`, `npm run release` (bump every workspace to one version, then build, commit, tag and publish) and `cargo test --workspace`. See [`CLAUDE.md`](CLAUDE.md) for the architecture, principles and conventions.
