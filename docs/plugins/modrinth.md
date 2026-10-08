# modrinth

`modrinth` adds mod files you name on [Modrinth](https://modrinth.com/) to a
pack, and `modrinthModpack` adds a whole Modrinth modpack: its loader, its
client-side files and its overrides. Both are exported from `@opys/minecraft`,
and both need no account or API key. Use `modrinth` when you choose the mods
yourself, and `modrinthModpack` when someone else has already chosen them.

```js
import { defineConfig } from '@opys/dev';
import { fabric, java, modrinth } from '@opys/minecraft';
```

You name a file by its version, not by its project. A version is one release
of a mod, and it has an id such as `N08Z8wog`. The version's page URL works
too, so you can paste it straight from the browser.

## Signatures

```ts
modrinth(options: ModrinthPluginOptions): ChainablePlugin
modrinthModpack(ref: string, options?: ModrinthModpackOptions): ChainablePlugin
```

`modrinth` takes one object, and `modrinthModpack` takes the modpack reference
as its first argument and an optional object after it.

## `modrinth`

| Name       | Type               | Default                       | Meaning                                                                                                                                                                                                                                                                                 |
| ---------- | ------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `versions` | `string[]`         | required                      | The versions to install. Each entry is a version id, such as `'N08Z8wog'`, or a version URL, such as `'https://modrinth.com/mod/lithium/version/N08Z8wog'`. Each version contributes one file: its primary file, or its first file if none is marked primary. Any other URL is refused. |
| `path`     | `(info) => string` | required                      | Called once for each file, and returns where the file goes. See below.                                                                                                                                                                                                                  |
| `apiBase`  | `string`           | `https://api.modrinth.com/v2` | The Modrinth API base URL. Change it only for a mirror.                                                                                                                                                                                                                                 |

A version id that Modrinth does not return stops the build. The plugin installs
the files you list and nothing else, so a mod's own dependencies must be listed
too.

`path` receives one object describing the file:

| Field           | Type     | Meaning                                                                          |
| --------------- | -------- | -------------------------------------------------------------------------------- |
| `filename`      | `string` | The name the file has on Modrinth, such as `lithium-fabric-0.15.4+mc1.21.1.jar`. |
| `versionId`     | `string` | The version id, such as `N08Z8wog`.                                              |
| `projectId`     | `string` | The id of the mod's project.                                                     |
| `versionNumber` | `string` | The version as Modrinth writes it, such as `mc1.21.1-0.15.4-fabric`.             |
| `size`          | `number` | The file's size in bytes.                                                        |

The string `path` returns is used as the artifact's path as it is. Write
`${game_directory}` and the other install-time variables into it, and they are
filled in on the launching machine. Put the mod into the `mods` folder, the
usual choice, by keeping the file name:

```js
path: (info) => '${game_directory}/mods/' + info.filename,
```

`path` is ordinary JavaScript, so one version can go to a different folder
from another, or be renamed. It cannot change which file is fetched: that is
always the version's primary file.

## `modrinthModpack`

| Name              | Type                                    | Default                                                  | Meaning                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | --------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ref`             | `string`                                | required                                                 | The modpack to install. Give a version id, such as `'fDlgR3Ps'`, a version URL such as `'https://modrinth.com/modpack/fabulously-optimized/version/fDlgR3Ps'`, or the direct link to a `.mrpack` file. A URL is taken as the file itself if it ends in `.mrpack` or points at `cdn.modrinth.com`; any other URL must contain `/version/<id>`, or the build stops. |
| `options.apiBase` | `string`                                | `https://api.modrinth.com/v2`                            | The Modrinth API base URL. Change it only for a mirror.                                                                                                                                                                                                                                                                                                           |
| `options.loader`  | `(spec: LoaderSpec) => ChainablePlugin` | The opys plugin for the pack's loader, with its defaults | Called with the loader the pack asks for. Its return value is the plugin that is used. See [the loader option](#the-loader-option).                                                                                                                                                                                                                               |

Given a version id, the plugin uses the `.mrpack` file of that version. If the
version has several, it uses the primary one, or the first if none is marked
primary. A version with no `.mrpack` file stops the build.

## What a modpack plugin does

`modrinthModpack` is an all-in-one plugin. It takes the pack's own loader and
stands it up, so you do not name the loader yourself. At build time it:

1. **Reads the pack.** It downloads the `.mrpack` once, and reads its
   `modrinth.index.json`. The index names the Minecraft version, the loader and
   every file of the pack. An index with no `minecraft` entry in its
   `dependencies` stops the build.
2. **Picks the loader** from the index's `dependencies`, and runs the matching
   opys plugin with the version it names. That plugin contributes the game as
   well, because a loader bundles vanilla Minecraft. The mapping is:

   | `dependencies` has | Loader plugin used                                       |
   | ------------------ | -------------------------------------------------------- |
   | `fabric-loader`    | `fabric(minecraft, { loader: fabricLoader })`            |
   | `forge`            | `forge('<minecraft>-<forge>')`, such as `1.20.1-47.4.10` |
   | `neoforge`         | `neoforge(<neoforge>)`                                   |
   | none of these      | `minecraft(minecraft)`, vanilla                          |
   | `quilt-loader`     | Not supported. The build stops with an error.            |

3. **Adds the client-side files.** Each file of the index becomes one artifact
   at `${game_directory}/<path>`, where `<path>` is the path in the index. Files
   the index marks `unsupported` on the client are skipped. Everything else is
   installed, including files the index marks `optional`.
4. **Adds the overrides.** The `.mrpack` itself is installed to
   `${root}/cache/modrinth-modpack.mrpack`, and two of its directories are
   unpacked into `${game_directory}`, with the directory name stripped off:
   `overrides/` first, which every side gets, then `client-overrides/`, which
   only the client gets. Because the second one is unpacked last, it wins where
   both carry a file.
5. **Re-exposes the launch.** The loader's `command`, `jvmArgs`, `mainClass` and
   `gameArgs` are available under `modrinthModpack`. So the same `manifest`
   block works for a Fabric, Forge or NeoForge pack.

Java is not part of the pack. A `.mrpack` does not name a JDK, so add
`java(...)` yourself, with the major version the pack's Minecraft release needs.

::: warning Quilt
A Quilt pack fails the build, because opys has no Quilt loader. Look for a
Fabric or Forge version of the pack instead.
:::

### The `loader` option

`loader` replaces the default loader plugin. It receives the spec, which is one
of these:

| `spec.loader` | Fields                            | Default plugin                                |
| ------------- | --------------------------------- | --------------------------------------------- |
| `'fabric'`    | `minecraft`, `fabricLoader`       | `fabric(minecraft, { loader: fabricLoader })` |
| `'forge'`     | `version` (`<minecraft>-<forge>`) | `forge(version)`                              |
| `'neoforge'`  | `version`                         | `neoforge(version)`                           |
| `'vanilla'`   | `minecraft`                       | `minecraft(minecraft)`                        |

Use it to give the loader options of your own, such as a mirror for its
document index. The default plugin is not exported, so when you replace it,
write the cases you need. The replacement must still return a plugin for
every spec, because the pack may ask for any of them:

```js
import { fabric, forge, minecraft, neoforge } from '@opys/minecraft';

// mirror.example.com is a placeholder for your own mirror.
const forgeIndex = 'https://mirror.example.com/metadata/forge';

modrinthModpack('fDlgR3Ps', {
  loader: (spec) => {
    switch (spec.loader) {
      case 'fabric':
        return fabric(spec.minecraft, { loader: spec.fabricLoader });
      case 'forge':
        return forge(spec.version, { source: forgeIndex });
      case 'neoforge':
        return neoforge(spec.version);
      case 'vanilla':
        return minecraft(spec.minecraft);
    }
  },
});
```

## How files are pinned

Each file is pinned to the hash Modrinth lists for it, when it lists one. The
installer checks what it downloads against that hash.

- **Mods.** The artifact carries the file's sha1 from the version's file list,
  and its size. If Modrinth lists no sha1 for a file, the artifact carries no
  hash.
- **Modpack files.** Each artifact carries the sha1 from the index's `hashes`,
  when the index has one. The index's `sha512` is not used.
- **Overrides.** The `.mrpack` is hashed at build time, by its sha1 and its
  size. The installer downloads it again and checks the bytes against that
  hash, so the overrides it unpacks are the ones the index was read from.

The URL of a mod is the one Modrinth lists for the file, on its CDN. The URL of
a modpack file is the first of the index's `downloads`. Either way the bundle
holds the URL, so it installs without going back to the API.

## Example

This config installs the Lithium mod on Fabric for Minecraft 1.21.1. Lithium
is a small, widely used optimization mod, and the version id is the one for
Lithium 0.15.4 on that Minecraft version:

<<< @/examples/plugin-modrinth-lithium/opys.config.mjs

Build it with `opys build`. The build writes `game.opys`, and the bundle's
artifact list has one entry for `lithium-fabric-0.15.4+mc1.21.1.jar` under
`${game_directory}/mods/`, pinned to its sha1.

A modpack needs only its reference, Java and the same `manifest` block as
above, with `modrinthModpack` where the loader was:

```js
import { defineConfig } from '@opys/dev';
import { java, modrinthModpack } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    // Fabulously Optimized 5.1.0 for Minecraft 1.20.1.
    modrinthModpack('fDlgR3Ps'),
    java('17'),
  ],
  manifest: {
    command: ({ modrinthModpack }) => modrinthModpack.command,
    args: ({ modrinthModpack }) => [
      modrinthModpack.jvmArgs,
      modrinthModpack.mainClass,
      modrinthModpack.gameArgs,
    ],
    workdir: '${game_directory}',
  },
});
```

This example uses Java 17 for Minecraft 1.20.1. For another pack, use the Java
major version that the pack's Minecraft release needs.

## See also

- [`curseforge`](./curseforge) does the same for CurseForge.
- [`links`](./link) pins a file on any other site.
- [`files`](./files) adds files from your own disk.
