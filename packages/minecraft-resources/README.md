# @opys/minecraft-resources

[![npm](https://img.shields.io/npm/v/@opys/minecraft-resources.svg)](https://www.npmjs.com/package/@opys/minecraft-resources)

Mods, resource packs, shaders and plugins for opys, kept in one TOML file.
`resources()` adds every file it lists, pinned by its hash, in the
directory it belongs to.

```sh
npm install -D @opys/dev @opys/minecraft-resources
```

## Example

```toml
# resources.toml
[common.mods]
fabric-api = "modrinth:fabric-api@0.116.17+1.21.1"
lithium    = "modrinth:lithium@mc1.21.1-0.15.4-fabric"
geckolib   = "modrinth:geckolib@4.9.3#fabric"

[client.mods]
sodium       = "modrinth:sodium@mc1.21.1-0.8.13-fabric"
mouse-tweaks = "curseforge:mouse-tweaks@5437294"

[client.resourcepacks]
faithful = "modrinth:faithful-32x@1.21.1-june-2026"

[server.plugins]
luckperms = "modrinth:luckperms@v5.5.71-bukkit"
```

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { resources, readResources } from '@opys/minecraft-resources';

const { clientResources, serverResources } = resources(
  readResources('resources.toml'),
);

export default defineConfig({
  plugins: [
    // …your loader and java…
    clientResources(),
  ],
});
```

`resources()` gives a plugin for each side. `clientResources()` installs
the `[common.…]` and `[client.…]` tables; a server pack's config reads the
same file and uses `serverResources()`.

## The file

A table is `[<side>.<directory>]`. The side is `common`, `client` or
`server`. Each line in it is one file:

```toml
<name> = "<where it comes from>"
```

### The name

The name is what the file is called once installed. The extension is added
for you: `sodium = "modrinth:sodium@…"` installs `mods/sodium.jar`.

This is on purpose. A published file is named after its version,
`sodium-fabric-0.8.13+mc1.21.1.jar`, so the next version would be a new
file beside the old one. A name you choose does not change, so an update
replaces the file.

- A name with a dot is taken whole, with nothing added:
  `"options.txt" = "file:defaults/options.txt"`.
- A name is used once per directory. The same name in `[common.mods]` and
  `[client.mods]` stops the build.

### Where it comes from

| You write                               | What it is                                  |
| --------------------------------------- | ------------------------------------------- |
| `modrinth:<project>@<version>`          | A Modrinth project and one of its versions. |
| `modrinth:<project>@<version>#<loader>` | The same, for one loader.                   |
| `curseforge:<project>@<file id>`        | A CurseForge file.                          |
| `file:<path>`                           | A file on your disk.                        |
| `file:<folder>/`                        | Every file in a folder on your disk.        |
| `https://…`                             | Any link.                                   |

**A version is required.** There is no way to write "the newest": the file
would then build a different pack on a different day. To update a mod,
change its version.

**Modrinth.** The project is its slug, the last part of its page's address.
The version is the version number shown on the site, or the version id.

Many projects give one number to several files, one per loader: JEI
`19.51.0.418` is a Fabric, a Forge and a NeoForge version. `#fabric` says
which you mean. The loader is spelled as Modrinth spells it: `fabric`,
`neoforge`, `forge`, `quilt`, `paper`.

A loader is a filter. With `#fabric`, a version that is not for Fabric
stops the build even when its number is unique, which catches a wrong
paste. Where a number is still shared, the build lists the versions with
their ids, and you write the id in place of the number:

```
Modrinth project "jade" has more than one version "15.10.6+fabric"; name one by its id:
  adpNvTZS (fabric, quilt; 1.21.1)
  A416FkrB (fabric, quilt; 1.21.1)
```

**CurseForge.** A file has no version, only a number: the last part of the
address of the file's page. The project's name in front of it is checked,
and a file that belongs to another project stops the build. CurseForge
needs an API key, passed as `curseforgeToken`.

**Files from disk.** A path is relative to the TOML file. The file travels
inside the bundle, so nothing has to host it.

A folder is written with a trailing `/` and goes into a folder called by
its name, subfolders kept. With `shared = "file:config/common/"` in
`[common.config]`, the file `config/common/jei/a.ini` is installed as
`config/shared/jei/a.ini`. Use the name `"."` to put a folder's contents
straight into the directory. Without the slash a folder is refused, so one
is never taken by accident.

### More than a source

A table in place of the string holds what a string cannot.

```toml
[client.mods]
journeymap = { source = "curseforge:journeymap@8923666", metadata = { optional = true } }
emi        = { github = { repo = "emilyploszaj/emi", tag = "1.1.24+1.21.1", asset = "emi-1.1.24+1.21.1+fabric.jar" } }
modmenu    = { github = { repo = "TerraformersMC/ModMenu", tag = "v20.0.3" } }
tool       = { gitlab = { project = "group/tool", package = "tool", version = "1.4.0", asset = "tool.jar" } }
```

| Field      | What it holds                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `source`   | Any of the strings above.                                                                         |
| `github`   | A release asset: `repo`, `tag`, and `asset`. `asset` may be left out when the release has one.    |
| `gitlab`   | A package file: `project`, `package`, `version`, `asset`, and `host` for a self-hosted GitLab.    |
| `metadata` | Anything you like. It is copied onto the file's entry in the manifest, and opys reads none of it. |

An entry has exactly one of `source`, `github` and `gitlab`. Any other
field is ignored, so a tool of yours can keep its own notes there. That
also means a misspelt `metadata` is dropped without a word.

### Directories

Five are built in, each under the game directory by its own name: `mods`,
`resourcepacks`, `shaderpacks`, `plugins`, `datapacks`.

Name any other in `[dirs]`, with where it is. Then it is a table like the
rest.

```toml
[dirs]
kubejs   = "${game_directory}/kubejs"
branding = "${root}/launcher/branding"

[common.kubejs]
scripts = "file:kubejs/"

[client.branding]
logo = "file:art/company-logo-final.png"
```

- A path begins with a variable. `${game_directory}` is where the game
  looks; `${root}` is the whole installation, for what lives outside the
  game directory.
- On a server `${game_directory}` means `${root}`, since a server has one
  directory for both. So one file serves a client and a server.
- A built-in directory can be moved the same way: `mods = "${root}/shared-mods"`.

A table for a directory that is neither built in nor in `[dirs]` stops the
build, so a typo is not a new directory.

## Without a file

`resources()` takes the tables, not a path. `readResources()` is one way
to get them. They can also be written in the config, in the same shape:

```js
const { clientResources } = resources({
  dirs: { kubejs: '${game_directory}/kubejs' },
  common: { mods: { lithium: 'modrinth:lithium@mc1.21.1-0.15.4-fabric' } },
  client: { mods: { sodium: 'modrinth:sodium@mc1.21.1-0.8.13-fabric' } },
});
```

Or read and then changed:

```js
const file = readResources('resources.toml');
const { clientResources } = resources({
  ...file,
  client: {
    ...file.client,
    mods: { ...file.client.mods, debug: 'file:dev/debug.jar' },
  },
});
```

A `file:` path is relative to the TOML file when the tables were read from
one, and to the config when they were written in it.

## Reading the file

`readResources('resources.toml')` takes the path from the directory you
run `opys` in. If you run it from somewhere else, give a URL, which does
not depend on that:

```js
readResources(new URL('resources.toml', import.meta.url));
```

## Options

The second argument holds keys for the sites that need one.

```js
resources(readResources('resources.toml'), {
  curseforgeToken: process.env.CURSEFORGE_TOKEN,
});
```

| Option            | What it does                                                 |
| ----------------- | ------------------------------------------------------------ |
| `curseforgeToken` | Your CurseForge API key. Needed for any `curseforge:` entry. |
| `githubToken`     | For GitHub: a higher rate limit, and private repositories.   |
| `gitlabToken`     | For private GitLab projects.                                 |

## From code

```js
import { readResources, resolveResources } from '@opys/minecraft-resources';

// One side, resolved: where each file goes, where it is, a size and a hash.
const files = await resolveResources(readResources('resources.toml'), 'client');
```

## Also

- One side's Modrinth entries are a request each, several at once. A pack
  of a hundred mods resolves in a few seconds.
- A mod's own dependencies are not followed. List each one.
- A `file:` entry takes a file or a whole folder. To pick files by a rule,
  use the `files` plugin.

## Docs

- [The full page](https://harmoniya-net.github.io/opys/plugins/resources): every option, and why it works this way
- [The format](https://harmoniya-net.github.io/opys/format/): what a manifest is made of
