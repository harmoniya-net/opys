# @opys/dev

`@opys/dev` is the build SDK. Use it to write a config, or a plugin that feeds
one: it has the config helpers, the build engine, the plugin contract, and the
two helpers a plugin reaches for, `files` and `userDataDir`. For a step-by-step
plugin, see [Writing a plugin](/reference/writing-a-plugin).

```sh
npm install -D @opys/dev
```

The exports are grouped by what you use them for. The types a signature names
are listed in the same group.

## Config

| Export          | Signature                                                                 | What it does                                                              |
| --------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `defineConfig`  | `(input: OpysConfigInput) => OpysConfigInput`                             | Identity helper for the default export of `opys.config.mjs`.              |
| `resolveConfig` | `(input: OpysConfigInput, ctx: OpysConfigContext) => Promise<OpysConfig>` | Calls the function form with `ctx`, or returns an object config as it is. |

`@opys/dev` does not load the file. The CLI imports `opys.config.mjs` and then
calls `resolveConfig`. Each field of the config is described in
[The config file](/guide/config).

| Type                 | Shape                                                                                                                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OpysConfig`         | `{ plugins, manifest, output?, runClient? }`                                                                                                                                                                                      |
| `OpysManifestConfig` | The `manifest` block: `command` and `args`, and optional `workdir`, `envs`, `vars`, `artifacts`, `restrict`. `command` and `args` are functions of a `PluginMap`. `workdir` and `envs` are either plain values or such functions. |
| `OpysConfigInput`    | `OpysConfig`, or a function from `OpysConfigContext` to one (it may return a promise)                                                                                                                                             |
| `OpysConfigContext`  | `{ mode: string }`. The value of `--mode`, or the command's name (`build`, `install` or `launch`) when the flag is not given                                                                                                      |
| `PluginMap`          | `Record<string, LaunchGroups>`, keyed by plugin name                                                                                                                                                                              |
| `ArgItem`            | `Valset \| Val \| string`, one entry of the assembled `args`                                                                                                                                                                      |

## Engine

| Export          | Signature                                                   | What it does                                                          |
| --------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `buildManifest` | `(config: OpysConfig, ctx: BuildContext) => Promise<Built>` | Runs every plugin's `build`, then merges the results into a manifest. |

`Built` is `{ manifest: Manifest; blobs: Blobs }`. The two travel together:
`writeBundle` from `@opys/core` publishes them as one file, and `@opys/runtime`
installs from them directly.

`buildManifest` runs the plugins in parallel. It then calls the `command`,
`args`, `workdir` and `envs` accessors of `manifest`, passing each plugin's
launch groups. The groups are used only there and are not part of the result.
The merge itself is done in native code. Its warnings, such as two plugins
setting the same var, are passed to `ctx.log` with the scope `opys`.

## The plugin contract

| Export         | Signature                                 | What it does                                                                                                                              |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `definePlugin` | `(plugin: OpysPlugin) => ChainablePlugin` | Returns a new plugin with the same `name` and `build`, and the fluent methods below. Other properties of the object are not carried over. |

A plugin is an object with a `name` and a `build` hook. Construction does no
I/O: the constructor returns the object, and all network and disk work happens
in `build`.

```ts
interface OpysPlugin {
  name: string;
  build(ctx: BuildContext): Promise<Contribution> | Contribution;
}

interface BuildContext {
  log(scope: string, message: string): void; // the CLI prints "[scope] message"
  configDir: string; // absolute directory of opys.config.mjs
  mode: string; // the value of --mode, or the command's name
}

interface Contribution {
  artifacts?: Artifact[];
  blobs?: Blobs; // where this plugin's blob artifacts are kept
  vars?: ValDefs;
  launch?: LaunchGroups; // named fragments for the config's accessors
  envs?: ValDefs; // launch environment; last plugin wins, the config overrides
}

type LaunchGroups = Record<string, Valset | Val | string>;
```

`envs` is merged across plugins in list order. A collision produces a warning,
and `manifest.envs` in the config is the final layer.

### Fluent methods

A `ChainablePlugin` is an `OpysPlugin` with five more methods. Each returns a
new plugin with one more transform on its artifacts, so the original is not
changed and a chain reads left to right. The transforms change `artifacts`
only. `vars`, `launch`, `blobs` and `envs` pass through.

| Method            | Signature                                                    | What it does                                                                                                                                        |
| ----------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exclude`         | `(match: Selector) => ChainablePlugin`                       | Drops every matching artifact.                                                                                                                      |
| `addRule`         | `(match: Selector, rules: RulesetInput) => ChainablePlugin`  | Appends a ruleset to each matching artifact's `rules`. A ruleset holds only if every rule in it does, so the artifact then applies in fewer places. |
| `removeIntegrity` | `(match: Selector) => ChainablePlugin`                       | Clears `integrity` on matching artifacts, so they install unverified.                                                                               |
| `updateFirst`     | `(match: Selector, patch: ArtifactPatch) => ChainablePlugin` | Shallow-merges a patch into the first matching artifact.                                                                                            |
| `updateMany`      | `(match: Selector, patch: ArtifactPatch) => ChainablePlugin` | Shallow-merges a patch into every matching artifact.                                                                                                |

`ArtifactPatch` is `Partial<Artifact>`, or a function from the artifact to one.
`RulesetInput` is anything `parseShortRuleset` accepts: a `Ruleset` in either
spelling. See [the rule spellings](/plugins/core#rules).

```js
const extra = files({ from: 'extra', to: 'mods/${rel}' })
  .exclude((a) => a.path.endsWith('.tmp'))
  .addRule((a) => a.path.endsWith('.jar'), 'allow.os.linux');
```

## Selectors

| Export            | Signature                                                 | What it does                              |
| ----------------- | --------------------------------------------------------- | ----------------------------------------- |
| `Selector`        | `string \| string[] \| ((artifact: Artifact) => boolean)` | Says which artifacts a method applies to. |
| `matchesSelector` | `(selector: Selector, artifact: Artifact) => boolean`     | Tests one artifact against a selector.    |

A string or an array of strings is a glob, or a list of them, matched against
`artifact.path`. An array matches if any of its globs does. A function is a
predicate and receives the whole artifact. The glob syntax is the one under
[Globs](/plugins/core#globs) in `@opys/core`.

::: warning Match the path as written
The path a selector sees is the one the plugin wrote, with `${root}` and other
references not yet expanded. In a glob `{` and `}` mean alternation, so a
pattern such as `${root}/mods/*.jar` does not match the text `${root}`. Begin
the pattern with `**/`, or use a predicate.
:::

## Files

| Export  | Signature                                    | What it does                                      |
| ------- | -------------------------------------------- | ------------------------------------------------- |
| `files` | `(options: FilesOptions) => ChainablePlugin` | Every file under a local directory, as artifacts. |

| Option | Type                 | Meaning                                                                                            |
| ------ | -------------------- | -------------------------------------------------------------------------------------------------- |
| `from` | `string`             | Directory to read, relative to the config file.                                                    |
| `to`   | `FileTemplate`       | Install path. Defaults to the file's `rel`.                                                        |
| `url`  | `FileTemplate`       | Where each file is published. Its presence is what makes the files pointed at rather than carried. |
| `hash` | `'sha1' \| 'sha256'` | Hash each file is pinned with. Defaults to `sha1`. Allowed only with `url`.                        |

A `FileTemplate` is a string or a function. A string may use `${rel}`,
`${dir}` and `${filename}`. Any other `${var}` is left for install. A function
receives a `LocalFile`, which has `rel`, `dir`, `filename`, `abs` and `size`.
Only the function form sees `abs`, the path on the build machine.

```js
files({ from: 'server-files', to: '${root}/${rel}' }); // carried in the bundle
files({ from: 'mods', to: 'mods/${rel}', url: 'https://cdn.example/${rel}' });
```

Every regular file under `from` is taken, in subdirectories too, in path order.
A symbolic link is skipped. With no `url`, each file becomes a blob, named by
its sha256, and travels in the bundle. With a `url`, each file is an artifact
that points at the copy you publish, pinned by its `hash` and size. The types
are `FilesOptions`, which is `EmbeddedFiles` or `PublishedFiles`, and
`FileTemplate`. The plugin page is [files](/plugins/files).

## Paths

| Export        | Signature                  | What it does                                              |
| ------------- | -------------------------- | --------------------------------------------------------- |
| `userDataDir` | `(name: string) => string` | The per-user data directory for `name`, by OS convention. |

On Windows this is `%APPDATA%\<name>`, or `<name>` in the home directory when
`APPDATA` is unset. On macOS it is `~/Library/Application Support/<name>`.
Elsewhere it is `$XDG_DATA_HOME/<name>`, or `~/.local/share/<name>` when that is
unset.

::: warning
`userDataDir` resolves the directory of the machine it runs on. Use it in
`runClient`, which runs at each launch. In `manifest.vars` it would bake the
build machine's path into every bundle. See
[Launch-time values](/guide/run-client).
:::

## Loader helpers

These are for a plugin that wraps a version document, such as a loader.

| Export         | Signature                             | What it does                                                                                |
| -------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `launchGroups` | `(t: LoaderTemplate) => LaunchGroups` | Projects a template's launch surface into `command`, `jvmArgs`, `mainClass` and `gameArgs`. |

`LoaderTemplate` is `{ launch: Launch; jvmArgs: Valset; mainClass: Val; gameArgs: Valset }`.

## See also

- [Writing a plugin](/reference/writing-a-plugin), a tutorial that builds one.
- [@opys/core](/plugins/core), the artifact, source and bundle types these
  signatures use.
- [Concepts](/guide/concepts), for the split between the build and the launch.
