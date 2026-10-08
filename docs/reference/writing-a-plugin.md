# Writing a plugin

This page is for a JavaScript developer who wants a plugin of their own in an
`opys.config.mjs`, rather than one from `@opys/minecraft`. You will build a
small one step at a time: first a variable, then a file from a URL, then a
generated file, then a launch argument. The finished config follows step 4.

A plugin is a plain object. You do not need a base class, a registration
step or anything from opys beyond the helpers in `@opys/dev` and
`@opys/core`.

## The contract

A plugin has a `name` and a `build` function:

```ts
interface OpysPlugin {
  name: string;
  build(ctx: BuildContext): Promise<Contribution> | Contribution;
}

interface BuildContext {
  log: (scope: string, message: string) => void;
  configDir: string;
  mode: string;
}

interface Contribution {
  artifacts?: Artifact[];
  blobs?: Blobs;
  vars?: ValDefs;
  launch?: Record<string, Valset | Val | string>;
  envs?: ValDefs;
}
```

`build` returns a `Contribution`, and every field of it is optional:

| Field       | What it adds to the manifest                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| `artifacts` | Files to download, copy or extract, each with a path and a source.                                    |
| `blobs`     | Where the bytes of this plugin's blob artifacts are on your machine.                                  |
| `vars`      | Variables the manifest defines, such as `motd` in step 1.                                             |
| `launch`    | Named pieces of the launch command, for your config's `command` and `args`.                           |
| `envs`      | Environment variables the launched game gets by default. The config's `manifest.envs` overrides them. |

`BuildContext` has three fields:

- `log(scope, message)` prints a line during the build. The CLI shows it as
  `[scope] message`, so pass your plugin's name as the scope.
- `configDir` is the absolute directory of the config file. Resolve paths you
  read from disk against it, not against the working directory.
- `mode` is the value of `--mode`. When the flag is not given, the CLI passes
  the command name (`build`, `install` or `launch`).

### Pure to construct, I/O in `build`

Calling your plugin's constructor must do no work. It returns the object, and
the engine calls `build` later, once per build. Every network request, file
read and hash belongs inside `build`. This is what lets a config import a
plugin module without side effects.

Plugins run only while building. A launcher never calls `build`, so anything
a plugin needs at launch has to be in its `Contribution`.

## Step 1: a variable

Start with the smallest plugin that does something. This one contributes one
variable and nothing else:

```js
import { definePlugin } from '@opys/dev';

const welcome = (motd) =>
  definePlugin({
    name: 'welcome',
    build(ctx) {
      ctx.log('welcome', `motd is "${motd}"`);
      return { vars: { motd } };
    },
  });
```

`vars` is a map from a name to a value, and any artifact path or launch
argument can refer to it as `${motd}`. Only the plugin that defines a variable
should set it; see [Names and owners](#names-and-owners) below.

`definePlugin` returns a new object with your `name` and `build` and the fluent
methods attached. Any other property of the object you pass in is not carried
over. A plain `{ name, build }` object works too, as long as you do not need
those methods. They are covered [further down](#overrides-with-selectors).

## Step 2: a file from a URL, with a pinned hash

An artifact says where a file goes (`path`), where it comes from (`source`),
and what its hash must be (`integrity`). This one downloads a library jar:

```js
build(ctx) {
  ctx.log('welcome', `motd is "${motd}"`);
  return {
    vars: { motd },
    artifacts: [
      {
        path: '${root}/downloads/brigadier-1.3.10.jar',
        source: {
          url: 'https://libraries.minecraft.net/com/mojang/brigadier/1.3.10/brigadier-1.3.10.jar',
        },
        size: 80082,
        integrity: { sha1: 'd15b53a14cf20fdcaa98f731af5dda654452c010' },
      },
    ],
  };
},
```

- `path` is a template. `${root}` is a launch-time value; the config supplies
  it in `runClient`, as the example does. See [Launch-time values](/guide/run-client).
- `integrity` is a hash the installer checks after download. It is one of
  `sha1`, `sha256` or `md5`, and it may be a list of such objects. Put one hash
  in each object: an object that holds two keeps only one. `size` is optional.
- An artifact accepts `path`, `source`, `size`, `rules`, `integrity`,
  `metadata` and `extract`. Any other key makes the build fail.
- The build does not download the file. It records the URL and the hash you
  wrote, so the hash has to be the real one. The installer is what checks the
  download against it.

## Step 3: a generated file, as a blob

Some files have no URL: a config your plugin writes, or a file you hold
yourself. Those travel inside the bundle as **blobs**. A blob is named by the
sha256 of its bytes, so the artifact names the blob and never a location:

```js
import { blobBytes, blobId, sourceBlob } from '@opys/core';

build(ctx) {
  // ...the URL artifact from step 2...
  const config = new TextEncoder().encode(`motd = "${motd}"\n`);
  const id = blobId(config);
  return {
    vars: { motd },
    artifacts: [
      // ...the URL artifact...
      { path: '${root}/config/welcome.toml', source: sourceBlob(id) },
    ],
    blobs: { [id]: blobBytes(config) },
  };
},
```

The three pieces do three jobs:

- `blobId(bytes)` returns the hex sha256 of the bytes. It is the name.
- `sourceBlob(id)` makes the artifact's `source`, `{ blob: id }`.
- `blobs` maps each id to where its bytes are on this machine. `blobBytes`
  holds bytes you generated; `blobFile(path)` points at a file on disk. For
  the id and size of a file on disk, `hashBlobFile(path)` returns a promise of
  both.

A blob artifact has no `integrity` of its own. The name is the hash, and the
installer checks the bytes against it. A blob that no artifact names is left
out of the bundle; the engine drops it.

::: tip Files on disk
You do not need to write this yourself for a directory of files. The `files`
helper in `@opys/dev` does the hashing and the placement. See
[files](/plugins/files).
:::

## Step 4: a launch group, used from `args`

A plugin cannot choose the launch command. It can offer pieces of it, and the
config decides the order. Each key of `launch` is a named group, and the
config reads it by the plugin's name:

```js
build(ctx) {
  // ...everything from step 3...
  return {
    vars: { motd },
    artifacts: [/* ... */],
    blobs: { [id]: blobBytes(config) },
    launch: { jvmArg: '-Dwelcome.motd=${motd}' },
  };
},
```

In the config, the plugin's groups arrive keyed by its name:

```js
manifest: {
  command: ({ java }) => java.bin,
  args: ({ welcome, minecraft }) => [
    welcome.jvmArg,
    minecraft.jvmArgs,
    minecraft.mainClass,
    minecraft.gameArgs,
  ],
  workdir: '${game_directory}',
},
```

A group value may be a string, a `Val` or a list of `Val`s, whichever the
config's `args` needs. A `Val` is a string, or an object `{ rules, value }` for
an argument that applies only where its rules hold.

The `${motd}` in the string is not expanded by the build; it is expanded at
launch, from the variables the manifest defines. Launch groups exist only to
feed the config's `command`, `args`, `workdir` and `envs` functions. They are
not written into the bundle; the arguments the functions return are.

## The finished config

This config has all four steps in one plugin, plus `minecraft` and `java` from
`@opys/minecraft`, and the `runClient` the launching machine needs:

<<< @/examples/plugin-author-welcome/opys.config.mjs

Build it and look at the result:

```sh
opys build
unzip -l game.opys
```

The bundle has the head, the artifact list, and one entry in `blobs/` for the
generated `welcome.toml`. The `welcome.jvmArg` argument comes first in the
game's launch line.

## Overrides with selectors

Each of the methods on a plugin returns a **new** plugin with one more change
to its artifacts. The original is untouched, so the chain reads left to right:

| Method                      | What it does                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exclude(match)`            | Drops every artifact that matches.                                                                                                                  |
| `addRule(match, rules)`     | Appends a ruleset to each matching artifact's `rules`. A ruleset holds only if every rule in it does, so the artifact then applies in fewer places. |
| `removeIntegrity(match)`    | Clears `integrity` on matching artifacts, so they install unverified.                                                                               |
| `updateFirst(match, patch)` | Shallow-merges `patch` into the first matching artifact.                                                                                            |
| `updateMany(match, patch)`  | Shallow-merges `patch` into every matching artifact.                                                                                                |

These change `artifacts` only. `vars`, `launch`, `blobs` and `envs` pass
through unchanged.

`match` is a **selector**. It is one of three things:

- a glob string, matched against the artifact's `path` (for example
  `'**/*.jar'`);
- an array of glob strings, which match if any of them does;
- a predicate `(artifact) => boolean`, for anything else, such as the kind of
  source.

`rules` takes the same shorthand as a manifest, such as `'allow.os.linux'`.
`patch` is either an object of fields to set, or a function of the matched
artifact that returns one.

```js
const pack = welcome('Hello')
  .addRule('**/brigadier-*.jar', 'allow.os.linux')
  .exclude((a) => 'blob' in a.source);
```

The first call adds a Linux-only rule to the jar from step 2. The second drops
every artifact whose source is a blob, which here is the generated file. The
chained methods run in order, on the artifacts the plugin's `build` returned.
A predicate receives each artifact as the manifest spells it, so
`'url' in a.source` is true for a URL and `'blob' in a.source` for a blob.

A glob is matched against the path as you wrote it, with `${root}` and other
references not yet expanded, and `{` and `}` mean alternation in a glob. So
begin a pattern with `**/` rather than naming `${root}` in it. The glob syntax
is in [@opys/core](/plugins/core#globs).

## Names and owners

A plugin's `name` does two things, so choose it with care:

- It is the key under which the config finds the plugin's launch groups, so
  `name: 'welcome'` makes `welcome.jvmArg` available to `args`. Two plugins
  with the same name overwrite each other's groups. Use a name that is a valid
  JavaScript identifier, so you can destructure it.
- It is the owner shown in warnings.

The scope of a log line is whatever you pass to `ctx.log`. Use the plugin's name
there too, so a reader can tell whose line it is.

Variables have one owner each. When two plugins set the same var, the one
later in `plugins` wins, and the build prints a warning:

```
[opys] warning: var 'motd' set by both 'welcome' and 'other' — using 'other'
```

Environment variables from `envs` follow the same rule and print a similar
warning. Artifacts follow it by path: when two artifacts have the same path,
the later one replaces the earlier, in plugin order and then
`manifest.artifacts`, with no warning.

Only one plugin should own a var. For example, only `java` sets `java_home`.
Name your vars after your plugin, so they cannot collide with someone
else's. If the config wants to set a var itself, `manifest.vars` is the
override layer, and it is silent; the config's value wins with no warning.

## Rules for a good plugin

- **Resolve everything at build time.** A manifest is fully resolved. It never
  says "the latest version" or "ask this server which file". Look up the
  version, the URL and the hash inside `build`, and write the concrete values
  into the contribution.
- **Pin every hash.** Give each URL artifact an `integrity`, and let blobs be
  named by their hash. An artifact with no hash is a file the installer cannot
  check.
- **Never read the launching machine.** `build` runs on the machine that
  makes the bundle. A path such as `userDataDir(...)`, `os.homedir()`, or a
  value from `process.env` describes that machine, and it is baked into the
  manifest for every player who installs it. Machine-specific values belong in
  `runClient` or in `--var`, where the launching machine supplies them.
- **Keep secrets out of the manifest.** A bundle is a file other people
  receive. An access token or a password never goes in `vars`, a blob or a
  launch group.
- **Use the helpers for files you already have.** `files` covers a directory on
  your disk, and `links` covers a file that is already published, on GitHub,
  GitLab, Modrinth, CurseForge or at any URL. They pin what they add. See
  [Mods and files](/guide/mods).

## Where to go next

- [@opys/dev](/plugins/dev) lists the build helpers.
- [Concepts](/guide/concepts) explains the manifest, the bundle and the two
  machines.
- [dgpuj](/plugins/dgpuj) is a short real plugin: it downloads a release for
  each platform and exposes its launcher as launch groups.
