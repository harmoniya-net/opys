# @opys/dev

[![npm](https://img.shields.io/npm/v/@opys/dev.svg)](https://www.npmjs.com/package/@opys/dev)

What an opys config is written with: `defineConfig`, the `files` plugin,
`options`, `userDataDir`, and `definePlugin` for a plugin of your own.

```sh
npm install -D @opys/dev @opys/minecraft
```

## Example

```js
// opys.config.mjs
import { defineConfig, files, options, userDataDir } from '@opys/dev';
import { forge, java } from '@opys/minecraft';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    forge({ version: '1.20.1' }),
    java({ version: '17' }),
    files({ from: 'mods', to: (file) => '${game_directory}/mods/' + file.rel }),
  ],
  manifest: {
    command: '@forge.command',
    args: [
      '@forge.jvmArgs',
      '-Xmx${xmx}M',
      '@forge.mainClass',
      '@forge.gameArgs',
    ],
    workdir: '${game_directory}',
  },
  options: options()
    .slider('xmx', { min: 2048, max: 16384, step: 512, default: 4096 })
    .title('RAM')
    .unit('MB'),
  run: (manifest) => ({
    vars: { ...manifest.vars, root: userDataDir('my-pack') },
  }),
});
```

## The config

What `defineConfig` takes: an object, or a function of `{ mode }` that
returns one.

| Field      | What it is                                                    |
| ---------- | ------------------------------------------------------------- |
| `plugins`  | What the pack is made of. No two with the same name.          |
| `manifest` | How to start it, and anything written by hand. See below.     |
| `output?`  | Where `opys build` writes the bundle, relative to the config. |
| `options?` | What a player may set. See [Options](#options).               |
| `run?`     | Called on the player's machine at every `opys launch`.        |

### manifest

| Field        | What it is                                                        |
| ------------ | ----------------------------------------------------------------- |
| `command`    | The program to run: `'@forge.command'`, or a literal.             |
| `args`       | Its arguments, in order.                                          |
| `workdir?`   | The directory to start it in.                                     |
| `vars?`      | Your own variables. They override a plugin's.                     |
| `envs?`      | Environment variables for the game.                               |
| `artifacts?` | Files written by hand. They override a plugin's at the same path. |
| `cleanup?`   | What to delete after installing.                                  |

Everything under `manifest` is copied into the bundle. A path or an account
that belongs to one machine goes in `run`, never here.

### The launch line

A string that begins with `@` is replaced by what a plugin offers. Anything
else is passed as written.

| You write          | Means                                                |
| ------------------ | ---------------------------------------------------- |
| `'@forge.jvmArgs'` | The group `jvmArgs` of the plugin named `forge`.     |
| `'-Xmx4G'`         | The argument `-Xmx4G`.                               |
| `'\\@file'`        | The argument `@file`, for one that really begins so. |

- A reference that names nothing stops the build:
  `'@welcome.flags': 'welcome' exposes no 'flags' (it has: flag)`.
- With `defineConfig`, a wrong reference is also a type error in your editor.
- A plugin used twice needs two names: `forge({ … }).as('forge2')`.

### run

```js
run: (manifest) => ({ vars: { ...manifest.vars, root: userDataDir('my-pack') } }),
```

Called on every `opys launch` and `opys install`, on the machine that runs
them. What it returns replaces those fields of the manifest. It is not in
the bundle: a launcher passes the same values as `vars`.

## Options

What a player may change before launching. They are written into the bundle
for a launcher to draw a settings screen.

<!-- prettier-ignore -->
```js
options: options()
  .slider('xmx', { min: 1024, max: 16384, step: 512, default: 4096 })
    .title('RAM')
    .unit('MB')
  .select('preset', { low: 'Low', high: 'High' })
    .title('Graphics')
  .feature('custom_java', (o) => o
    .directory('java_home')
      .title('Java folder'))
    .title('Custom Java'),
```

| Kind                       | Sets       | Its steps                |
| -------------------------- | ---------- | ------------------------ |
| `.slider(name, range)`     | a variable | `unit`                   |
| `.select(name, choices)`   | a variable | `default`                |
| `.text(name)`              | a variable | `placeholder`, `default` |
| `.file(name)`              | a variable |                          |
| `.directory(name)`         | a variable |                          |
| `.feature(name, options?)` | a feature  | `default`, `options`     |

Every kind also has `title`, which it needs, and `subtitle`. The full
description is in [`@opys/bundle`](https://www.npmjs.com/package/@opys/bundle#options).

## files

A folder on your disk, as files of the pack.

| Option  | What it does                                                       |
| ------- | ------------------------------------------------------------------ |
| `from`  | The folder, relative to the config.                                |
| `to?`   | Where each file is installed. Default: its path inside the folder. |
| `url?`  | Where each file is downloaded from. Without it, files are carried. |
| `hash?` | With `url`: `'sha1'` or `'sha256'`, what each file is pinned with. |

`to` and `url` are functions of the file:

| Field      | For `mods/extra/tweaks.jar` in `from: 'mods'` |
| ---------- | --------------------------------------------- |
| `rel`      | `extra/tweaks.jar`                            |
| `dir`      | `extra`                                       |
| `filename` | `tweaks.jar`                                  |
| `abs`      | The full path on your disk.                   |
| `size`     | Its size in bytes.                            |

### Files · carried

Without `url`, each file goes into the bundle.

<!-- prettier-ignore -->
```jsonc
// files({ from: 'mods', to: (file) => '${game_directory}/mods/' + file.rel })
// in the manifest
{
  "path": "${game_directory}/mods/a.jar",
  "source": { "blob": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824" },
  "size": 5
}
```

### Files · published elsewhere

With `url`, the bundle holds only the link and the hash.

<!-- prettier-ignore -->
```jsonc
// files({ from: 'mods', to: …, url: (file) => 'https://cdn.example.com/' + file.rel, hash: 'sha1' })
// in the manifest
{
  "path": "${root}/a.jar",
  "source": { "url": "https://cdn.example.com/a.jar" },
  "size": 5,
  "integrity": { "sha1": "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d" }
}
```

## Adjusting a plugin

Every plugin has these. Each returns a new plugin and changes only its
files.

| Method                       | What it does                              |
| ---------------------------- | ----------------------------------------- |
| `.exclude(match)`            | Drops the matching files.                 |
| `.addRule(match, rules)`     | Adds rules to them: `'allow.os.windows'`. |
| `.removeIntegrity(match)`    | Installs them without checking a hash.    |
| `.updateFirst(match, patch)` | Changes fields of the first match.        |
| `.updateMany(match, patch)`  | Changes fields of every match.            |
| `.as(name)`                  | The same plugin under another name.       |

`match` is a glob over the install path, a list of globs, or a function of
the file. `patch` is the fields to change, or a function that returns them.

## A plugin of your own

```js
import { definePlugin } from '@opys/dev';

export const welcome = ({ text }) =>
  definePlugin({
    name: 'welcome',
    build: (ctx) => ({
      artifacts: [
        {
          path: '${game_directory}/welcome.txt',
          source: { bytes: new TextEncoder().encode(text) },
        },
      ],
      vars: { greeting: text },
      launch: { flag: ['--welcome'] },
    }),
  });
```

`build` is the only hook. It runs at build time and returns:

| Field        | What it is                                                   |
| ------------ | ------------------------------------------------------------ |
| `artifacts?` | Files to install.                                            |
| `vars?`      | Variables the plugin owns.                                   |
| `launch?`    | Named pieces of the command line, used as `'@welcome.flag'`. |
| `envs?`      | Environment variables for the game.                          |

A file's `source` says where its bytes are:

| Source      | What it is                          | In the bundle               |
| ----------- | ----------------------------------- | --------------------------- |
| `{ url }`   | A download. Give it an `integrity`. | The link.                   |
| `{ file }`  | A file on the build machine.        | The file itself, as a blob. |
| `{ bytes }` | A `Uint8Array` the plugin made.     | The bytes, as a blob.       |

`build` receives:

| Field       | What it is                                   |
| ----------- | -------------------------------------------- |
| `configDir` | The config's directory, for relative paths.  |
| `mode`      | `--mode`, or the command's name.             |
| `log`       | `log(scope, message)`, shown while building. |

## Functions

| Function                           | What it does                                          |
| ---------------------------------- | ----------------------------------------------------- |
| `defineConfig(config)`             | Returns the config, with its references type-checked. |
| `definePlugin(plugin)`             | Returns the plugin, with the methods above.           |
| `files(options)`                   | The plugin for a folder on disk.                      |
| `options()`, `slider`, `select`, … | A pack's options.                                     |
| `userDataDir(name)`                | The per-user data folder for `name`, on this machine. |
| `buildManifest(config, ctx)`       | Runs the plugins. Returns `{ manifest, blobs }`.      |
| `resolveConfig(input, { mode })`   | Calls a config function, if it is one.                |
| `pluginOptions(example, options)`  | Refuses a plugin called without an options object.    |

For a loader plugin: `launchGroups`, `carrying`, `withLibraryFiles` and the
types `LoaderTemplate`, `LoaderGroups` and `ExtraLibrary`.

## Every function

Each function, in each way it is used.

<!-- prettier-ignore -->
```js
// a config that depends on the command: `opys launch --mode dev`
defineConfig(({ mode }) => ({ plugins: [/* … */], manifest: { command: 'java', args: [] } }));

// files
files({ from: 'mods' });                                              // installed at a.jar, sub/b.jar
files({ from: 'mods', to: (file) => '${game_directory}/mods/' + file.rel });
files({ from: 'mods', to: (file) => '${root}/' + file.filename });    // flattened
files({ from: 'mods', url: (file) => 'https://cdn.example.com/' + file.rel, hash: 'sha256' });
files('mods');
// throws a TypeError: a plugin takes one options object

// adjusting a plugin
files({ from: 'mods' }).exclude('**/*.tmp');
forge({ version: '1.20.1' }).exclude(['**/log4j-*.jar', '**/*-sources.jar']);
forge({ version: '1.20.1' }).addRule('**/*-natives-windows.jar', 'allow.os.windows');
links({ links: [url], to }).removeIntegrity('**/nightly-*.jar');
forge({ version: '1.20.1' }).updateFirst('**/guava-*.jar', { size: 2874025 });
forge({ version: '1.20.1' }).updateMany(
  (file) => 'url' in file.source,
  (file) => ({ source: { url: file.source.url.replace('maven.example.com', 'mirror.example.com') } }),
);
forge({ version: '1.20.1' }).as('forge2');                            // '@forge2.jvmArgs'

// the per-user data folder
userDataDir('my-pack');
// Linux:   ~/.local/share/my-pack   (or $XDG_DATA_HOME/my-pack)
// macOS:   ~/Library/Application Support/my-pack
// Windows: %APPDATA%\my-pack

// building without the CLI
const config = await resolveConfig(input, { mode: 'build' });
const ctx = { configDir: process.cwd(), mode: 'build', log: (scope, message) => console.log(scope, message) };
const { manifest, blobs } = await buildManifest(config, ctx);
// manifest: { vars, artifacts, launch }   blobs: { '8f434346…': { bytes: 'aGk=' } }
await writeBundle('game.opys', manifest, blobs, { options: config.options }); // from @opys/bundle

// what stops a build
// '@welcome.flags': 'welcome' exposes no 'flags' (it has: flag)
// two plugins are named 'welcome': rename one with `.as('…')`
```

## Documentation

- [The config](https://harmoniya-net.github.io/opys/basics/config): every field, with when and why to use it
- [Writing a plugin](https://harmoniya-net.github.io/opys/plugins/writing-a-plugin)

Part of [opys](https://github.com/harmoniya-net/opys).
