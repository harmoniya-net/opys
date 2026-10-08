# The config file

This page covers every field of `opys.config.mjs`, the module that
`opys build` and `opys launch` read. It is for pack authors: what each field
does, how the plugins' contributions combine, and where a value must not go.

The config is an ordinary JavaScript module. Its default export comes from
`defineConfig`, which returns its argument unchanged and exists so that your
editor can check the shape. Here is a complete config that builds and
launches:

<<< @/examples/config-full/opys.config.mjs

## The shape

| Field       | Type     | Purpose                                                |
| ----------- | -------- | ------------------------------------------------------ |
| `output`    | string   | Where `opys build` writes the bundle. Optional.        |
| `plugins`   | list     | The plugins whose output makes up the installation.    |
| `manifest`  | object   | How to start it, and anything literal to add.          |
| `runClient` | function | Launch-time values, applied on every launch. Optional. |

`manifest` takes the fields in the table below. Only `command` and `args` are
required.

| Field       | Type               | Purpose                                              |
| ----------- | ------------------ | ---------------------------------------------------- |
| `command`   | function           | The program to run. Required.                        |
| `args`      | function           | The arguments, in the order you list them. Required. |
| `workdir`   | string or function | The working directory. Defaults to `.`.              |
| `envs`      | object or function | Environment variables for the game.                  |
| `vars`      | object             | Build-time variables, baked into the bundle.         |
| `artifacts` | list               | Literal files to add to the installation.            |
| `restrict`  | list of globs      | Files to delete after install.                       |

## Object or function

`defineConfig` takes either the config itself or a function that returns it:

```js
export default defineConfig(({ mode }) => ({
  // ...
}));
```

The function form receives one value, `mode`. It is the value of
`opys build --mode <m>` (or `opys launch --mode`, `opys install --mode`).
When you do not pass `--mode`, `mode` is the name of the command that is
running: `build`, `install` or `launch`. Use it to make one config produce
two installations:

```js
export default defineConfig(({ mode }) => {
  const release = mode === 'release';
  return {
    // plugins and manifest can read `release` here
  };
});
```

The function may also return a promise, so the config can read files or ask
the network before it declares its plugins.

opys reads `opys.config.mjs` from the current directory unless you pass
`-i <file>`. The directory the config is in is the anchor for relative
paths, such as the `from` of `files`.

## output

`output` is the path of the bundle `opys build` writes. A relative path is
resolved from the config's directory. Conventionally it is `<name>.opys`.
`opys build -o <path>` overrides it.

`opys launch` ignores `output`. It builds the manifest in memory and never
writes a bundle.

## plugins

`plugins` is a flat list. There are no roles, and nothing checks how many of
a kind you have: the list says what the installation is made of, and nothing
else.

```js
plugins: [
  minecraft('1.21.1'),
  java('21'),
  files({ from: 'mods', to: 'mods/${rel}' }),
],
```

All plugins are built at once. Their output is then folded into the manifest
in list order, and the order is what decides the outcome when two plugins
disagree. Three things are merged, and a fourth is passed through:

**Artifacts** are concatenated in plugin order, and then the literal
`manifest.artifacts` follow. Two artifacts with the same path are one
artifact: the later one wins, and the path keeps the position of its first
appearance. Paths are compared after normalising them, so `mods/a.jar` and
`./mods//a.jar` are the same path.

**Vars** are merged in plugin order, and the later plugin wins. If two
different plugins set the same name, the build prints a warning and keeps the
later value:

```text
[opys] warning: var 'NAME' set by both 'FIRST' and 'LAST' — using 'LAST'
```

`NAME` is the variable, and `FIRST` and `LAST` are the two plugins, in the
order they appear in the list. The message for envs says `env` where it says
`var`.

The warning is for a collision you did not intend. To settle one on purpose,
set the name in `manifest.vars` (or `manifest.envs`), which applies silently.

**Envs** follow the same rule as vars, with the same warning. A plugin uses
them for defaults: `java` exports `JAVA_HOME`, so the game has it without you
asking. `manifest.envs` is the last layer and overrides them.

**Launch groups** are the named pieces a plugin offers for the command line,
such as `jvmArgs`, `mainClass` and `gameArgs` from a loader, or `bin` from
`java`. They are not merged. They are handed to your `command` and `args`
functions, described next.

A plugin's `name` is its key in those functions, and the collision warning
above names plugins by it. Give each plugin you write its own name: two with
the same name share one key, and the collision warning never fires between
them. The plugins that ship with opys are named after their factory
function: `minecraft`, `forge`, `java`, `files`, `links` and so on.

## manifest.command, args, workdir

`command` and `args` are functions, and `workdir` and `envs` may be either a
plain value or a function. A function receives a `PluginMap`: an object keyed
by plugin name, whose values are that plugin's launch groups. You read the
pieces you need by name:

```js
manifest: {
  command: ({ java }) => java.bin,
  args: ({ minecraft }) => [
    minecraft.jvmArgs,
    minecraft.mainClass,
    minecraft.gameArgs,
  ],
  workdir: '${game_directory}',
},
```

`command` returns the program to run, usually the Java binary, and is
required. `args` returns a list. Each item is a string, a single value, or a
list of values, and they are flattened into one line in the order you wrote
them. Put the JVM arguments before the main class and the game arguments
after it. The order is yours: nothing is sorted by role.

`workdir` is the working directory of the game. If you omit it, it is `.`.
It can be a string or a function of the plugin map.

The functions run at build time, so they can only see what the plugins
declare. If you need a value that only the launching machine knows, it does
not belong here. See [Launch-time values](./run-client).

## manifest.envs

`envs` sets environment variables for the game process. It takes an object,
or a function of the plugin map that returns one:

```js
envs: { PACK_NAME: 'my-pack' },
```

These are applied on top of the plugins' own `envs`, so a key you set here
wins over a plugin's default with the same name.

## manifest.vars

`vars` are variables the manifest sets for itself. They are merged over the
variables the plugins declare, and they override them without a warning.

```js
manifest: {
  vars: {
    motd: release ? 'Welcome' : 'Development build',
  },
  // ...
},
```

`manifest.vars` is baked into the bundle. Every player who installs the
bundle gets the same values. Use it only for build-time constants, such as a
version label or a feature switch. Never put a path on your disk, a username
or an access token here: those belong in `runClient`, which runs on the
launching machine. The page on [launch-time values](./run-client) says where
each one goes.

## manifest.artifacts

`artifacts` is a list of literal artifacts, appended after the plugins'
output. An artifact is a file the installation needs: where it goes, where it
comes from and the hash it must have. Most authors never write one by hand.
The `files` plugin and the `links` plugin make them from a directory on your
disk or from a published URL. See [Mods and files](./mods).

If a literal artifact has the same path as a plugin's artifact, it replaces
it, because it comes later.

## manifest.restrict

`restrict` is a list of globs. After the installation is written, the
installer deletes every file that matches one of them and is not an artifact
of the manifest. It is how a pack removes a mod that an older version left
behind:

```js
restrict: ['${game_directory}/mods/*.jar'],
```

The globs are interpolated with the same variables as everything else, so
`${game_directory}` works. In a glob, `*` and `?` match within one directory
level, `**` matches across levels, and `{a,b}` chooses between alternatives.
Keep them narrow. A glob that matches your own saves or settings deletes them
on the next install. [Publishing a bundle](./publishing#removing-files-restrict)
says exactly which directory is swept and when.

## Variables and ${name}

Artifact paths and URLs, the command, the arguments, `workdir`, `envs` and
`restrict` can refer to variables with `${name}`. A variable is a name with a value; the value can itself
contain `${other}` references, which are resolved first. The installer
substitutes the values when it installs and launches. A reference to a name
that nothing defines is left as written, and a circular reference is an
error. The variables a manifest leaves open, such as `root` and `username`,
are listed in [Variables](/launcher/vars).

Do not confuse these with the placeholders of `files`. `${rel}`, `${dir}` and
`${filename}` are filled in at build time, once for each file the `files`
plugin finds, and are not variables at all.

## runClient

`runClient` is a function that runs on the launching machine, every time the
game starts. It receives the built manifest and returns the fields to replace:
a shallow merge, so a field you return replaces the same field entirely, and
the rest stay as built. It is where your root directory, your account and any
token go, because those differ for each player and must not be baked into the
bundle. Its full treatment is on [Launch-time values](/guide/run-client).

## Next

- [Concepts](./concepts) explains why the config has a build half and a
  launch half.
- [Loaders](./loaders), [Java](./java) and [Mods and files](./mods) describe
  the plugins you put in `plugins`.
- [Publishing a bundle](./publishing) covers what to do with the file
  `opys build` writes.
