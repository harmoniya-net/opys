# @opys/minecraft-server

[![npm](https://img.shields.io/npm/v/@opys/minecraft-server.svg)](https://www.npmjs.com/package/@opys/minecraft-server)

A Minecraft server for opys. `server()` adds one server jar, pinned by its
hash, and the line that starts it.

```sh
npm install -D @opys/dev @opys/minecraft-server @opys/java
```

## Example

```js
// opys.config.mjs
import { defineConfig } from '@opys/dev';
import { java } from '@opys/java';
import { server } from '@opys/minecraft-server';

export default defineConfig({
  output: 'server.opys',
  plugins: [server({ paper: '1.21.1' }), java({ version: '21' })],
  manifest: {
    command: '@server.command',
    args: ['-Xmx4G', '@server.jar', '@server.args'],
    workdir: '${root}',
  },
});
```

```sh
opys build
opys launch server.opys --var root=/srv/minecraft --feature eula
```

A server is one file, or two for Forge and NeoForge. It downloads its own
libraries the first time it starts, so they are not in the manifest and
opys does not check them.

## Which server

The field that names the server holds its version.

| You write                                               | What you get                                      |
| ------------------------------------------------------- | ------------------------------------------------- |
| `server({ vanilla: '1.21.1' })`                         | Mojang's own server.                              |
| `server()`                                              | Mojang's own, the current release.                |
| `server({ paper: '1.21.1' })`                           | Paper, its newest stable build.                   |
| `server({ purpur: '1.21.1' })`                          | Purpur, its newest build.                         |
| `server({ fabric: '1.21.1' })`                          | Fabric, its newest stable loader.                 |
| `server({ forge: '1.21.1' })`                           | Forge, the build Forge recommends.                |
| `server({ neoforge: '21.1.259' })`                      | NeoForge. Its own version, not Minecraft's.       |
| `server({ jar: 'https://…/folia.jar' })`                | Any jar by link. It is downloaded once to pin it. |
| `server({ jar: 'build/spigot-1.21.1.jar' })`            | Any jar on your disk. It travels in the bundle.   |
| `server({ installer: 'https://…/fork-installer.jar' })` | A fork of Forge or NeoForge, by its installer.    |

Spigot and CraftBukkit have no download: you build them with
[BuildTools](https://www.spigotmc.org/wiki/buildtools/) and pass the jar by
path.

## Options

| Option   | For                        | What it does                                  |
| -------- | -------------------------- | --------------------------------------------- |
| `build`  | `paper`, `purpur`, `forge` | One exact build: `133`, `'52.1.16'`.          |
| `loader` | `fabric`                   | One exact loader version.                     |
| `apis`   | any                        | Mirrors: `{ paper: 'https://…', mojang: … }`. |

A server takes its own options and no other's. `server({ paper: '1.21.1',
loader: '0.19.5' })` is refused: a loader is Fabric's. Two servers at once,
`server({ paper, fabric })`, are refused too.

Pin the build of a pack you publish. Without `build` or `loader`, building
the same config next month can give a newer server.

## Looking up versions

Three functions, for a config or for a panel that lets someone choose.

```js
import {
  serverVersions,
  serverBuilds,
  resolveServer,
} from '@opys/minecraft-server';

await serverVersions('paper'); // ['26.3', '26.2', '1.21.11', …]
await serverBuilds('paper', '1.21.1'); // ['133', '132', '131', …]

await resolveServer({ paper: '1.21.1' });
// {
//   pinned: { paper: '1.21.1', build: '133' },
//   label: 'Paper 1.21.1 build 133',
//   files: [{ path: '${root}/server.jar', source: { url }, size, integrity }],
// }
```

`pinned` is the same thing you pass to `server()`, with nothing left to "the
newest". Paste it into your config to keep that exact server.

| Server     | `serverVersions`                 | `serverBuilds`        |
| ---------- | -------------------------------- | --------------------- |
| `vanilla`  | Mojang's releases.               | None.                 |
| `paper`    | Minecraft versions, stable ones. | Stable build numbers. |
| `purpur`   | Minecraft versions, stable ones. | Build numbers.        |
| `fabric`   | Minecraft versions, stable ones. | Loader versions.      |
| `forge`    | Minecraft versions.              | Forge builds.         |
| `neoforge` | NeoForge versions, stable ones.  | None.                 |

Lists are newest first. A pre-release is left out of a list and still works
when you name it: `server({ neoforge: '26.3.0.69-beta' })`.

## Forge and NeoForge

They publish an installer and no server: the installer patches Minecraft on
the machine it runs on. opys adds two files, the installer and NeoForge's
[ServerStarterJar](https://github.com/neoforged/ServerStarterJar), which
runs the installer and then starts the server.

- The first start installs. That takes about half a minute and downloads
  what the installer needs; opys does not check those files.
- **Forge stops after installing.** Start it once more. NeoForge installs
  and starts in one go.
- Moving to a newer build installs it on the next start, in the same folder.
- Start from the server's folder: keep `workdir: '${root}'`.
- Forge needs Minecraft 1.17 or newer. An older one is refused at build.

## The EULA

A Minecraft server does not start until `eula.txt` says `eula=true`. That is
you agreeing to [Mojang's EULA](https://aka.ms/MinecraftEULA).

The plugin writes that file only when the `eula` feature is on, and a
feature is given where the server is installed:

```sh
opys launch server.opys --var root=/srv/minecraft --feature eula
```

Launching from your config, say it in `run`:

```js
run: (manifest) => ({
  manifest: { vars: { ...manifest.vars, root: '/srv/minecraft' } },
  features: ['eula'],
}),
```

- There is no `eula: true` option. An option would put the agreement into
  the bundle, and whoever you give the bundle to would then have agreed
  without being asked.
- Without the feature nothing is written. The server stops and asks, as it
  does without opys.
- For a panel or a launcher, offer it as a checkbox:

```js
options: options().feature('eula').title('I agree to the Minecraft EULA'),
```

## Your world and settings

`server.properties`, the world, `plugins/` and `mods/` are not in the
manifest. Installing again leaves them alone.

To ship your own settings or plugins, add them with
[`files()`](https://harmoniya-net.github.io/opys/plugins/files) or
[`links()`](https://harmoniya-net.github.io/opys/plugins/links):

```js
links({
  links: ['https://modrinth.com/plugin/luckperms/version/v5.4.145-bukkit'],
  to: (file) => '${root}/plugins/' + file.filename,
}),
```

A file added this way is the manifest's: every install puts it back as it
was built.

## What it adds

`opys build` turns the plugin into these parts of the manifest.

### Files

<!-- prettier-ignore -->
```jsonc
// in the manifest
{
  "path": "${root}/server.jar",
  "source": { "url": "https://fill-data.papermc.io/v1/objects/39bd…/paper-1.21.1-133.jar" },
  "size": 49394394,
  "integrity": { "sha256": "39bd8c00b9e18de91dcabd3cc3dcfa5328685a53b7187a2f63280c22e2d287b9" }
},
{
  "path": "${root}/eula.txt",
  "source": { "blob": "…" },
  "rules": "allow.features.eula"
}
```

### Launch

| You write           | In the manifest                  |
| ------------------- | -------------------------------- |
| `'@server.command'` | `"${java_bin}"`                  |
| `'@server.jar'`     | `"-jar"`, `"${root}/server.jar"` |
| `'@server.args'`    | `"nogui"`                        |

For Forge, NeoForge and `installer`, `'@server.jar'` also holds
`"--installer-force"`, the starter's flag for installing a newer build.

Your own JVM flags go before `'@server.jar'`, and the server's own flags
after it:

```js
args: ['-Xms4G', '-Xmx4G', '@server.jar', '@server.args', '--port', '25566'],
```

### Variables

| Variable | Value | What it is                                         |
| -------- | ----- | -------------------------------------------------- |
| `root`   | `.`   | The server's folder. Set it with `--var` or `run`. |

## Java

The plugin ships no Java. Add [`java()`](https://www.npmjs.com/package/@opys/java):

```js
java({ version: '21' }); // a JDK in the bundle's manifest
java({ system: true }); // the machine's own
```

On Windows, start with `--feature java_console`. Without it `java()` picks
`javaw`, which has no console to type server commands into.

## Documentation

- [The format](https://harmoniya-net.github.io/opys/format/): what a manifest is made of
- [`run`](https://harmoniya-net.github.io/opys/basics/config#run): what only the launching machine knows

Part of [opys](https://github.com/harmoniya-net/opys). Also exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
