# Writing a plugin

A plugin is small. It has a name and one function, `build`, which returns
the plugin's share of the manifest. If you can describe what you want as
"these files, these variables, these arguments", you can write it as a
plugin, right inside your config.

## The shape

```js
import { definePlugin } from '@opys/dev';

const myPlugin = (options) =>
  definePlugin({
    name: 'myPlugin',
    async build(ctx) {
      return {
        artifacts: [], // files to install
        vars: {}, // variables
        envs: {}, // environment variables for the game
        launch: {}, // named pieces of the command line
      };
    },
  });
```

Every field is optional. Return only what you have.

`build` receives a small context:

| Field                     | What it is                                                        |
| ------------------------- | ----------------------------------------------------------------- |
| `ctx.log(scope, message)` | Prints a `[scope] message` line during the build.                 |
| `ctx.configDir`           | The folder of the config file. Resolve relative paths against it. |
| `ctx.mode`                | The value of `--mode`.                                            |

One rule about structure: **calling the plugin does nothing.**
`myPlugin({ … })` only returns `{ name, build }`. All the real work, network
requests and file reads included, happens inside `build`. That keeps a config
cheap to load, and lets opys run all plugins at once.

## A worked example

This plugin does one of everything: it sets a variable, adds a file from a
URL, adds a generated file, and offers a JVM argument.

<<< @/examples/plugin-author-welcome/opys.config.mjs

Going through what `build` returns:

**`vars`** become manifest variables. Here `motd` can then be used as
`${motd}` anywhere.

**`artifacts`** are the files. The first is a download: a path, a URL, and
the hash it must have. Always give a hash. A file without one cannot be
checked, and is never refreshed once it exists.

**The second artifact is carried**: a file that travels inside the bundle.
Its source says where the bytes are right now, in memory (`{ bytes }`) or in
a file (`{ file: path }`). The build reads them, names them by their sha256
and stores them in the bundle. Nothing to hash yourself.

**`launch`** offers named pieces of the command line. Because the plugin is
called `welcome` and offers `jvmArg`, the config can write
`'@welcome.jvmArg'`. With `definePlugin`, TypeScript knows that name too, and
a typo in the config is flagged as you type.

A launch piece can be a string, or a list, or limited to a platform:

```js
launch: {
  jvmArgs: [
    '-Dfoo=bar',
    { rules: 'allow.os.osx', value: ['-XstartOnFirstThread'] },
  ],
},
```

## What makes a good plugin

- **Decide everything in `build`.** A manifest never says "the latest
  version". Look up the version, the URL and the hash while building, and
  write down the exact answers.
- **Pin every file.** If nobody publishes a hash for it, download it in
  `build` and hash it yourself.
- **Describe the pack, not your machine.** `build` runs on the build machine.
  A home directory or an environment variable read there is baked in for
  every player. Use `${root}`-style variables for paths.
- **No secrets in what you return.** A bundle is a zip that other people
  receive.
- **Own your names.** Prefix your variables with your plugin's name so they
  cannot collide with another plugin's. Pick a plugin name that reads well
  in `'@name.group'`.
- **Take one options object**, like the built-in plugins, so configs read the
  same everywhere.

## You may not need one

Before writing a plugin, check whether an existing one does the job:

- A folder of files: [`files`](/plugins/files).
- A file at a URL: [`links`](/plugins/links).
- An existing plugin that is nearly right:
  [adjust its output](/basics/config#adjusting-a-plugin) with
  `.exclude()` and friends. Every plugin made with `definePlugin` has those
  methods, yours included.
