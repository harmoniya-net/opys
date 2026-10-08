# curseforge

`curseforge` adds mod files you name on [CurseForge](https://www.curseforge.com/)
to a pack, and `curseforgeModpack` adds a whole CurseForge modpack: its loader,
its mod files and its overrides. Both are exported from `@opys/minecraft`. Use
`curseforge` when you choose the mods yourself, and `curseforgeModpack` when
someone else has already chosen them.

Unlike Modrinth, CurseForge needs an API key. Both plugins find every file
through CurseForge's API, which answers only requests that carry a key. The key
is used when you build, and the built bundle does not need it.

## API key

Get a key from the [CurseForge console](https://console.curseforge.com/#/api-keys).
Pass it to the plugin as `token`. The plugin does not read the environment
itself, so the config must give it the value. The convention on this page is
`CURSEFORGE_TOKEN`:

```sh
export CURSEFORGE_TOKEN=...   # your key, in your shell, never in the config
opys build
```

```js
const token = process.env.CURSEFORGE_TOKEN;
if (!token) throw new Error('Set CURSEFORGE_TOKEN to a CurseForge API key');
```

Two failures are worth knowing. If `token` is `undefined`, the build stops with
``Failed to convert JavaScript value `Undefined` into rust type `String` ``, and
the check above gives a clearer message. If the API does not accept the key, the
build stops with `CurseForge API 403 (POST /mods/files)`.

Keep the key out of the config, which you may share. The bundle does not
contain it either: the key is sent to the API, and the URLs it returns are
public CDN links.

## Signatures

```ts
curseforge(options: CurseforgePluginOptions): ChainablePlugin
curseforgeModpack(options: CurseforgeModpackOptions): ChainablePlugin
```

Both take one object. The modpack's reference goes inside it, as `file`.

## `curseforge`

| Name      | Type                   | Default                         | Meaning                                                                                                                                                                                                                                                                                          |
| --------- | ---------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `token`   | `string`               | required                        | Your CurseForge API key. See [API key](#api-key).                                                                                                                                                                                                                                                |
| `files`   | `(number \| string)[]` | required                        | The files to install. Each entry is a numeric file id, such as `6717445`, or a file's page URL, such as `https://www.curseforge.com/minecraft/mc-mods/<slug>/files/<id>`. The id is the number after `/files/`. Any other string is refused. Each file becomes one artifact, in the order given. |
| `path`    | `(info) => string`     | required                        | Called once for each file, and returns where the file goes. See below.                                                                                                                                                                                                                           |
| `apiBase` | `string`               | `https://api.curseforge.com/v1` | The CurseForge API base URL. Change it only for a mirror.                                                                                                                                                                                                                                        |

`path` receives one object describing the file:

| Field       | Type     | Meaning                              |
| ----------- | -------- | ------------------------------------ |
| `filename`  | `string` | The name the file has on CurseForge. |
| `fileId`    | `number` | The file's id.                       |
| `projectId` | `number` | The id of the mod's project.         |
| `size`      | `number` | The file's size in bytes.            |

The string `path` returns is used as the artifact's path as it is. Write
`${game_directory}` into it, and it is filled in on the launching machine:

```js
path: (info) => '${game_directory}/mods/' + info.filename,
```

A file that CurseForge does not return makes the build fail with
`CurseForge API did not return metadata for file <id>`. Check the id. The
plugin installs the files you list and nothing else, so a mod's own
dependencies must be listed too.

## `curseforgeModpack`

| Name      | Type                                    | Default                                                  | Meaning                                                                                                                             |
| --------- | --------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `token`   | `string`                                | required                                                 | Your CurseForge API key. See [API key](#api-key).                                                                                   |
| `file`    | `number \| string`                      | required                                                 | The modpack's file: a numeric id, such as `4800279`, or the file's page URL, `https://www.curseforge.com/.../files/<id>`.           |
| `apiBase` | `string`                                | `https://api.curseforge.com/v1`                          | The CurseForge API base URL. Change it only for a mirror.                                                                           |
| `loader`  | `(spec: LoaderSpec) => ChainablePlugin` | The opys plugin for the pack's loader, with its defaults | Called with the loader the pack asks for. Its return value is the plugin that is used. See [the loader option](#the-loader-option). |

## What a modpack plugin does

`curseforgeModpack` is an all-in-one plugin. It reads the pack, takes its
loader and stands that loader up, so you do not name the loader yourself. At
build time it:

1. **Reads the pack.** It looks up the modpack file, downloads its `.zip`
   once, and reads the `manifest.json` inside. The manifest names the Minecraft
   version, the mod loader, every mod file and the overrides directory.
2. **Picks the loader** from the manifest's `modLoaders`. It uses the entry
   marked `primary`, or the first entry if none is marked. Its id has the form
   `<loader>-<version>`, and the mapping is:

   | `modLoaders` id       | Loader plugin used                                                    |
   | --------------------- | --------------------------------------------------------------------- |
   | `forge-<forge>`       | `forge('<minecraft>-<forge>')`, such as `1.20.1-47.4.20`              |
   | `fabric-<loader>`     | `fabric(minecraft, { loader: <loader> })`                             |
   | `neoforge-<neoforge>` | `neoforge(<neoforge>)`                                                |
   | `quilt-…`             | Not supported. The build stops with an error.                         |
   | any other loader      | The build stops with `Unknown CurseForge mod loader`.                 |
   | no entry at all       | The build stops with `CurseForge modpack manifest has no mod loader.` |

   The loader plugin contributes the game as well, because a loader bundles
   vanilla Minecraft.

3. **Adds the mod files.** Each file in the manifest is looked up by its id,
   and becomes one artifact at `${game_directory}/mods/<filename>`. Every file in
   the manifest is installed. The manifest's `required` flag is not read, so an
   optional entry is installed too. A file that CurseForge no longer returns
   stops the build.
4. **Adds the overrides.** The modpack `.zip` is installed to
   `${root}/cache/curseforge-modpack.zip`. The directory the manifest names in
   `overrides` (`overrides` if the field is empty) is unpacked into
   `${game_directory}`, with the directory name stripped off.
5. **Re-exposes the launch.** The loader's `command`, `jvmArgs`, `mainClass` and
   `gameArgs` are available under `curseforgeModpack`, so the same `manifest`
   block works for a Forge, Fabric or NeoForge pack.

Java is not part of the pack. A manifest does not name a JDK, so add
`java(...)` yourself.

::: warning Quilt
A Quilt pack fails the build, because opys has no Quilt loader.
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
write a case for every spec the pack may ask for. A CurseForge pack never asks
for `'vanilla'`, because it must name a loader, but the type includes it:

```js
import { fabric, forge, minecraft, neoforge } from '@opys/minecraft';

// mirror.example.com is a placeholder for your own mirror.
const forgeIndex = 'https://mirror.example.com/metadata/forge';

curseforgeModpack({
  token,
  file: 4800279,
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

Each file is pinned to the hash CurseForge lists for it, when it lists one.
The installer checks what it downloads against that hash.

- **Mod files.** The artifact carries the file's sha1 from the API, and its
  size. If the API lists no sha1 for a file, the artifact carries no hash.
- **Download URL.** The URL is the one the API gives for the file. When the API
  gives none, which happens when the author has opted out of third-party
  distribution, the URL is the file's address on CurseForge's CDN, derived from
  its id and name.
- **Overrides.** The modpack `.zip` is hashed at build time, by its sha1 and its
  size. The installer downloads it again and checks the bytes against that
  hash.

A built bundle installs without the key, because every URL in it is a public
CDN link.

## Example

The config below installs one mod file on Forge 1.20.1. Set `CURSEFORGE_TOKEN`
to your key before you build it.

```js
import { defineConfig, userDataDir } from '@opys/dev';
import { curseforge, forge, java } from '@opys/minecraft';

const token = process.env.CURSEFORGE_TOKEN;
if (!token) throw new Error('Set CURSEFORGE_TOKEN to a CurseForge API key');

export default defineConfig({
  output: 'game.opys',
  plugins: [
    forge('1.20.1'),
    java('17'),
    curseforge({
      token,
      path: (info) => '${game_directory}/mods/' + info.filename,
      files: [
        6717445, // a file id; the file's page URL works too
      ],
    }),
  ],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ forge }) => [forge.jvmArgs, forge.mainClass, forge.gameArgs],
    workdir: '${game_directory}',
  },
  runClient: (manifest) => ({
    vars: {
      ...manifest.vars,
      root: userDataDir('my-pack'),
      username: 'Player',
      uuid: '00000000-0000-0000-0000-000000000001',
      token: '0', // the game's access token, not the CurseForge key
    },
  }),
});
```

A modpack config is the same shape, with `curseforgeModpack` in place of the
loader and the mods:

```js
import { defineConfig } from '@opys/dev';
import { curseforgeModpack, java } from '@opys/minecraft';

const token = process.env.CURSEFORGE_TOKEN;
if (!token) throw new Error('Set CURSEFORGE_TOKEN to a CurseForge API key');

export default defineConfig({
  output: 'game.opys',
  plugins: [
    curseforgeModpack({ token, file: 4800279 }),
    // Fabulously Optimized 5.4.1 is for Minecraft 1.20.1, which takes Java 17.
    java('17'),
  ],
  manifest: {
    command: ({ curseforgeModpack }) => curseforgeModpack.command,
    args: ({ curseforgeModpack }) => [
      curseforgeModpack.jvmArgs,
      curseforgeModpack.mainClass,
      curseforgeModpack.gameArgs,
    ],
    workdir: '${game_directory}',
  },
});
```

## See also

- [`modrinth`](./modrinth) does the same for Modrinth, with no key needed.
- [`links`](./link) pins a file on any other site.
- [`files`](./files) adds files from your own disk.
