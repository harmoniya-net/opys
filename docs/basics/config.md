# The config

`opys.config.mjs` is a plain JavaScript file. It describes one pack.

## The smallest config

<<< @/examples/basics-intro/opys.config.mjs

Four parts, always the same:

| Part       | Answers                                   |
| ---------- | ----------------------------------------- |
| `output`   | Where does `opys build` write the bundle? |
| `plugins`  | What is the pack made of?                 |
| `manifest` | How is the game started?                  |
| `run`      | What does only the player's machine know? |

`defineConfig` changes nothing. It is there so your editor can check the
config as you type.

The rest of this page goes through each feature: what it does, when you
need it, and why it works that way.

## Plugins

<!-- prettier-ignore -->
```js
plugins: [
  forge({ version: '1.20.1' }),
  java({ version: '17' }),
],
```

A plugin adds part of the pack: files, variables, pieces of the command
line. The list is flat, and each plugin takes one options object.

**Why plugins?** A real installation is thousands of files. Nobody should
write that list by hand, and each plugin knows one part of it well.

**When two plugins disagree**, the later one in the list wins. For
variables the build also prints a warning, because that is usually an
accident.

Which plugins exist, and what each one adds: [Plugins](/plugins/).

## The launch line

```js
manifest: {
  command: '@forge.command',
  args: ['@forge.jvmArgs', '-Xmx4G', '@forge.mainClass', '@forge.gameArgs'],
  workdir: '${game_directory}',
},
```

A string starting with `@` is a **reference**: `'@forge.jvmArgs'` becomes the
JVM arguments the `forge` plugin worked out. Everything else is passed as
written.

**When you touch it:** to add your own flags (`-Xmx4G`), or to put another
plugin's arguments in a specific place, such as an auth agent that must come
first.

**Why you write it yourself:** argument order matters to Java, and only you
know what your pack needs. So opys does not guess. It gives you the pieces
and you place them.

**Typos are caught.** A reference that names nothing stops the build and
lists what exists. Your editor flags it even earlier.

::: details Two small rules

- For an argument that really starts with `@`, write `'\\@args.txt'`.
- Take `command` from the loader (`'@forge.command'`), not from Java
  directly. Your config then keeps working if a loader ever needs to start
  differently.

:::

## Variables

```js
workdir: '${game_directory}',
```

`${name}` is a placeholder. It is filled in on the player's machine, when
the game is installed and started.

**Why:** the bundle is the same file for every player, but each player
installs somewhere else. So paths are written relative to `${root}`, and the
player's machine says what `root` is.

**Watch out:** a name nobody defines is left as written, silently. If the
game shows a player called `${username}`, that is what happened.

All the names: [Variables](/plugins/minecraft#variables).

## run

```js
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
```

`run` is called on the launching machine, every time the game starts. It
returns two things, both optional:

| Field      | What it is                                                     |
| ---------- | -------------------------------------------------------------- |
| `manifest` | The parts of the manifest to replace.                          |
| `features` | Features to switch on, the same as `--feature` on the command. |

```js
run: (manifest) => ({
  manifest: { vars: { ...manifest.vars, root: '/srv/minecraft' } },
  features: ['eula'],
}),
```

**When you need it:** always, for `opys launch`. It supplies the install
folder and the player.

**Why it is separate from `manifest`:** everything under `manifest` is baked
into the bundle and shared with every player. Your home folder and your
token must not be. `run` is never baked in.

::: warning The classic mistake
`userDataDir()` in `manifest.vars` bakes _your_ home folder into the bundle.
The pack then works for you and nobody else. Keep it in `run`.
:::

Keep `...manifest.vars`. Each field under `manifest` replaces the old one
whole, so without the spread the plugins' variables are lost.

A bundle does not contain `run`. Whoever launches a bundle passes the same
values with `--var`, or from their launcher.

## Your own variables and environment

```js
manifest: {
  vars: { pack_version: '1.4.0' },
  envs: { PACK_VERSION: '${pack_version}' },
},
```

`vars` adds variables. `envs` sets environment variables for the game.

**When:** a constant you want in several places, or a value a mod reads from
the environment.

**Also for overrides.** `manifest.vars` wins over any plugin, with no
warning. It is the place to settle a variable two plugins both set.

Constants only. These are baked into the bundle, so no paths and no
secrets.

## Options

What a player may change before launching: memory, a resolution, a switch.

<!-- prettier-ignore -->
```js
import { defineConfig, options } from '@opys/dev';

export default defineConfig({
  // ...
  options: options()
    .slider('xmx', { min: 1024, max: 16384, step: 512, default: 4096 })
      .title('RAM')
      .unit('MB')
    .select('preset', { low: 'Low', high: 'High' })
      .title('Graphics')
      .default('high')
    .feature('custom_java', (o) => o
      .directory('java_home')
        .title('Java folder'))
      .title('Custom Java'),
});
```

A kind adds an option. The steps after it belong to that option, until the
next kind.

| Kind                       | Sets       | To                       | Its steps                |
| -------------------------- | ---------- | ------------------------ | ------------------------ |
| `.slider(name, range)`     | a variable | A number in a range.     | `unit`                   |
| `.select(name, choices)`   | a variable | One of `choices`.        | `default`                |
| `.text(name)`              | a variable | A line of text.          | `placeholder`, `default` |
| `.file(name)`              | a variable | The path of a file.      |                          |
| `.directory(name)`         | a variable | The path of a directory. |                          |
| `.feature(name, options?)` | a feature  | On or off.               | `default`, `options`     |

Every kind also has `title` and `subtitle`.

- The name is the variable or feature your manifest already uses: `${xmx}`
  in an argument, `allow.features.custom_java` in a rule.
- **Every option needs a `title`.** `opys build` names the one that has none.
- A select starts on its first choice unless `default` says otherwise.
- A feature is off unless `.default(true)`.
- The options under a feature only matter while it is on.
- `opys build` refuses a name used twice and a slider default outside its
  range.

::: warning
Choices are shown in the order written, except values that look like whole
numbers. JavaScript lists those first, in numeric order: `{ b: 'B', 2: 'Two',
1: 'One' }` is shown as One, Two, B.
:::

**One by one.** Each kind is also a function, for a list or for a feature
that reads top down:

```js
import { directory, feature, slider } from '@opys/dev';

options: [
  slider('xmx', { min: 1024, max: 16384, step: 512, default: 4096 })
    .title('RAM')
    .unit('MB'),
  feature('custom_java')
    .title('Custom Java')
    .options(directory('java_home').title('Java folder')),
],
```

**This is a description, not a value.** Options go into the bundle so a
launcher can draw a settings screen. The launcher passes what the player
chose as `vars` and `features`. `opys launch` does not read them: use
`--var` and `--feature`.

## cleanup

```js
manifest: {
  cleanup: [{ includes: ['${game_directory}/mods/*.jar'] }],
},
```

Deletes files after an install.

**When:** you remove a mod from the pack. Without `cleanup`, players who
already have it keep the jar forever, because opys only adds and updates.

**Why it is safe:** a file your pack installs is never deleted, whatever the
rule says. So the rule above means "every jar in `mods` that is _not_ part
of this pack".

```js
cleanup: [
  { includes: ['${game_directory}/config/**'], excludes: ['**/options.txt'] },
],
```

`excludes` spares files. `*` stays inside one folder, `**` crosses folders.

::: warning Keep rules narrow
A rule that matches a player's saves deletes their saves. opys refuses the
obviously dangerous ones (a relative path, a `..`, an empty variable), but
it cannot know what matters to a player.
:::

## Adjusting a plugin

```js
modrinth({ versions, to })
  .exclude('**/*-sources.jar')
  .addRule('**/sodium-*.jar', 'disallow.os.osx'),
```

Every plugin can be adjusted after the fact.

**When:** a plugin is almost right. One file you do not want, one mod that
breaks on macOS, one download you want from your own mirror.

| Method                       | Does                                |
| ---------------------------- | ----------------------------------- |
| `.exclude(match)`            | Drops the matching files.           |
| `.addRule(match, rule)`      | Limits them to a platform.          |
| `.updateFirst(match, patch)` | Changes fields of the first match.  |
| `.updateMany(match, patch)`  | Changes fields of every match.      |
| `.removeIntegrity(match)`    | Installs them without a hash check. |

`match` is a glob over file paths, or a function. Start a glob with `**/`:
it is compared with the path before variables are filled in.

## The same plugin twice

```js
modrinth({ versions: mods, to: intoMods }),
modrinth({ versions: packs, to: intoResourcePacks }).as('resourcepacks'),
```

**When:** one plugin, two destinations.

**Why `.as()`:** references go by plugin name, so two plugins cannot share
one. `.as()` gives the second its own.

## Dev and release from one config

```js
export default defineConfig(({ mode }) => {
  const dev = mode === 'dev';
  return {
    output: dev ? 'pack-dev.opys' : 'pack.opys',
    // ...
  };
});
```

```sh
opys build --mode dev
```

**When:** a test build with extra mods, less memory, or another folder.

Without `--mode`, `mode` is the command's name: `build`, `install` or
`launch`. The function may be `async`.

## A single file by hand

```js
manifest: {
  artifacts: [
    {
      path: '${game_directory}/server-icon.png',
      source: { url: 'https://example.com/icon.png' },
      integrity: { sha256: '…' },
    },
  ],
},
```

**When:** rarely. [`links`](/plugins/links) does the same and finds the
hash for you. This is the escape hatch.

## Everything together

A complete pack: Fabric, two mods from Modrinth, its own config files, a dev
variant, and cleanup of dropped mods.

<<< @/examples/basics-everything/opys.config.mjs
