# @opys/minecraft

Everything Minecraft in one import. This package has no code of its own: it
re-exports the loader, provider and helper packages, each of which is also
published separately and documented in its own README.

```sh
npm install -D @opys/dev @opys/minecraft
```

```js
import { defineConfig } from '@opys/dev';
import { forge, java, links } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    forge('1.20.1'),
    java('17'),
    links({
      links: ['https://modrinth.com/mod/sodium/version/JjCVwmVA'],
      path: (file) => '${game_directory}/mods/' + file.filename,
    }),
  ],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ forge }) => [forge.jvmArgs, forge.mainClass, forge.gameArgs],
    workdir: '${game_directory}',
  },
});
```

## What it re-exports

| From                                                                 | Plugins and helpers                                              |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [`@opys/minecraft-vanilla`](../minecraft-vanilla)                    | `minecraft`, `resolveMinecraft`, the shared mappers              |
| [`@opys/forge`](../forge)                                            | `forge`, `resolveForge`                                          |
| [`@opys/neoforge`](../neoforge)                                      | `neoforge`, `resolveNeoForge`                                    |
| [`@opys/fabric`](../fabric)                                          | `fabric`                                                         |
| [`@opys/cleanroom`](../cleanroom), [`@opys/lwjgl3ify`](../lwjgl3ify) | `cleanroom`, `lwjgl3ify`                                         |
| [`@opys/modrinth`](../modrinth), [`@opys/curseforge`](../curseforge) | `modrinth`, `modrinthModpack`, `curseforge`, `curseforgeModpack` |
| [`@opys/link`](../link)                                              | `links` — a pasted link to a pinned file                         |
| [`@opys/java`](../java)                                              | `java` — a JDK for the launching machine                         |
| [`@opys/dgpuj`](../dgpuj)                                            | `dgpuj` — the discrete-GPU launcher shim                         |
| [`@opys/authliberty`](../authliberty), [`@opys/bifrost`](../bifrost) | `authliberty`, `bifrost`                                         |
| [`@opys/minecraft-serverlist`](../minecraft-serverlist)              | `serverlist`                                                     |

Local files come from `files`, and `defineConfig` itself, from
[`@opys/dev`](../dev).

## Variable reference

The template sets these vars (interpolatable with `${name}`):

| Variable            | Default                            |
| ------------------- | ---------------------------------- |
| `root`              | `.`                                |
| `version_name`      | Minecraft version id               |
| `version_dir`       | `${root}/versions/${version_name}` |
| `library_directory` | `${root}/libraries`                |
| `natives_directory` | `${version_dir}/natives`           |
| `assets_root`       | `${root}/assets`                   |
| `game_directory`    | `${root}/`                         |
| `username`          | (must be supplied at launch)       |
| `uuid`              | (must be supplied at launch)       |
| `token`             | (must be supplied at launch)       |
