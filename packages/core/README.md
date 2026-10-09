# @opys/core

[![npm](https://img.shields.io/npm/v/@opys/core.svg)](https://www.npmjs.com/package/@opys/core)

The opys format, as code. `@opys/core` is the types a manifest is made of, and
the functions that check and evaluate one. Use it to inspect or produce a
manifest yourself. A pack author never imports it. The `.opys` file a manifest
is stored in is [`@opys/bundle`](https://www.npmjs.com/package/@opys/bundle).

```sh
npm install @opys/core
```

## Example

Check a manifest, then ask what one machine gets from it.

```js
import { decodeManifest, filterManifest, resolvedArgs } from '@opys/core';

const manifest = decodeManifest({
  vars: { root: '/games/pack' },
  artifacts: [
    {
      path: '${root}/libs/a.jar',
      source: { url: 'https://example.com/a.jar' },
      integrity: { sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709' },
    },
    {
      path: '${root}/natives.zip',
      source: { url: 'https://example.com/natives-windows.zip' },
      rules: 'allow.os.windows',
    },
  ],
  launch: {
    command: 'java',
    workdir: '${root}',
    args: ['-cp', '${root}/libs/a.jar', 'Main'],
  },
});

const linux = { name: 'linux', arch: 'x86_64', version: '' };
filterManifest(manifest, linux).artifacts.length; // 1: the natives are for Windows
resolvedArgs(manifest.launch, linux); // ['-cp', '${root}/libs/a.jar', 'Main']
```

## The format

Every structure of the format: what it is, its fields, and how it is written.
The TypeScript type of the same name is exported.

```text
Manifest
├── vars               ValDefs
├── artifacts          Artifact[]
│   ├── source         Source
│   ├── integrity      Integrity
│   ├── rules          Ruleset
│   └── extract        ExtractRule
├── launch             Launch
└── cleanup            CleanupRule[]
```

A `${name}` inside a string is a variable. A `?` after a field means it may
be left out.

### Manifest

A whole installation: what to install, how to start it, what to delete. In a
bundle it is the entry `manifest.json`.

| Field        | Type            | What it is                       |
| ------------ | --------------- | -------------------------------- |
| `vars?`      | `ValDefs`       | Named values.                    |
| `artifacts?` | `Artifact[]`    | The files to install.            |
| `launch?`    | `Launch`        | How to start the game.           |
| `cleanup?`   | `CleanupRule[]` | What to delete after installing. |

<!-- prettier-ignore -->
```jsonc
{
  "vars": { "root": "/games/pack" },
  "artifacts": [
    {
      "path": "${root}/libs/a.jar",
      "source": { "url": "https://example.com/a.jar" },
      "integrity": { "sha1": "da39a3ee5e6b4b0d3255bfef95601890afd80709" }
    }
  ],
  "launch": {
    "command": "java",
    "workdir": "${root}",
    "args": ["-cp", "${root}/libs/a.jar", "com.example.Main"]
  },
  "cleanup": [{ "includes": ["${root}/mods/*.jar"] }]
}
```

Without `launch`, a manifest can be installed and not started.

### ValDefs

Variables: a map from a name to its value. Used by `vars` and by
`launch.envs`.

| A value is        | Type               | What it means                                |
| ----------------- | ------------------ | -------------------------------------------- |
| a string          | `string`           | The same on every machine.                   |
| a list of choices | `ConditionalVal[]` | One per platform. The last that passes wins. |

<!-- prettier-ignore -->
```jsonc
{
  "root": "/games/pack",
  "game_directory": "${root}/",       // a value may use other variables
  "classpath_separator": [
    { "value": ":" },                 // no rules: always passes, so it is the default
    { "value": ";", "rules": "allow.os.windows" }
  ]
}
```

- A cycle between variables is an error.
- A name nothing defines is left as written: the game receives `${username}`.
- `\${` is a literal `${`.

### ConditionalVal

One choice of a variable's value.

| Field    | Type      | What it is                              |
| -------- | --------- | --------------------------------------- |
| `value`  | `string`  | The value.                              |
| `rules?` | `Ruleset` | Where it applies. Left out: everywhere. |

<!-- prettier-ignore -->
```jsonc
{ "value": "${java_home}/bin/javaw.exe", "rules": "allow.os.windows" }
```

If no choice passes, the variable is not defined at all.

### Ruleset

Where something applies. One `Rule`, or a list of them. **Every** rule must
pass.

<!-- prettier-ignore -->
```jsonc
"allow.os.linux"
["allow.os.linux", "disallow.features.demo"]   // on Linux, with `demo` off
```

Two `allow` rules for two systems pass nowhere, since no machine is both.
"Windows or Linux" is `disallow.os.osx`.

### Rule

One condition. It has two spellings that mean the same, and a reader accepts
both.

**Short**, a string: `<action>.<kind>.<value>`.

| Rule                          | Passes                            |
| ----------------------------- | --------------------------------- |
| `allow.os.windows`            | On Windows. Also `linux`, `osx`.  |
| `allow.arch.aarch64`          | On ARM64. Also `x86_64`.          |
| `allow.features.java_console` | When that feature is switched on. |
| `allow.os.osx@^14`            | On macOS whose version matches.   |
| `disallow.os.osx`             | Everywhere except macOS.          |
| `allow`, `disallow`           | Always, never.                    |

**Long**, an object: `MojangRule`, the form the game's own files use.

| Field       | Type                         | What it is                                 |
| ----------- | ---------------------------- | ------------------------------------------ |
| `action`    | `'allow' \| 'disallow'`      | What to do when the condition holds.       |
| `os?`       | `{ name?, arch?, version? }` | All the fields given must match.           |
| `features?` | `{ [name]: boolean }`        | Each must be on (`true`) or off (`false`). |

<!-- prettier-ignore -->
```jsonc
{ "action": "allow", "os": { "name": "osx", "arch": "aarch64" } }
{ "action": "disallow", "features": { "is_demo_user": true } }
```

A `disallow` rule passes when its condition does **not** hold.

### Artifact

One file of the installation: where it goes, where it comes from, how it is
checked.

| Field        | Type                           | What it is                             |
| ------------ | ------------------------------ | -------------------------------------- |
| `path`       | `string`                       | Where the file is written.             |
| `source`     | `Source`                       | Where its bytes come from.             |
| `integrity?` | `Integrity`                    | The hash it must have.                 |
| `size?`      | `number`                       | Bytes. For progress, not for checking. |
| `rules?`     | `Ruleset`                      | Which machines get it. Left out: all.  |
| `extract?`   | `ExtractRule \| ExtractRule[]` | How to unpack it once it is in place.  |
| `metadata?`  | anything                       | Notes. An installer ignores it.        |

<!-- prettier-ignore -->
```jsonc
{
  "path": "${library_directory}/org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-linux.jar",
  "source": { "url": "https://libraries.minecraft.net/…/lwjgl-3.3.3-natives-linux.jar" },
  "size": 110704,
  "integrity": { "sha1": "149070a5480900347071b7074779531f25a6e3dc" },
  "rules": "allow.os.linux",
  "extract": { "into": "${natives_directory}", "clean": true }
}
```

- Any other field is an error. A field a reader does not understand could
  change what gets installed.
- Without `integrity` a file is never checked: once it exists it is kept, even
  if the source changed.

### Source

Where an artifact's bytes come from. One of two, told apart by the field
present.

| Form       | What it is                                                 |
| ---------- | ---------------------------------------------------------- |
| `{ url }`  | A download. The URL may use variables.                     |
| `{ blob }` | A carried file: an entry of the bundle, at `blobs/<blob>`. |

<!-- prettier-ignore -->
```jsonc
{ "url": "https://example.com/a-1.0.jar" }
{ "blob": "3d862eef2acd67a2dcb60351bda23e6ad7ebd51939b393eede30ec140ba3c20d" }
```

A blob is named by the sha256 of its content, in lowercase hex. The name is
the hash, so a blob artifact needs no `integrity`. Both fields at once is an
error.

### Integrity

The hash a file must have. One `HashEntry`, or a list; with a list, matching
any one is enough.

| A `HashEntry` is | Value              |
| ---------------- | ------------------ |
| `{ sha1 }`       | 40 hex characters. |
| `{ sha256 }`     | 64 hex characters. |
| `{ md5 }`        | 32 hex characters. |

<!-- prettier-ignore -->
```jsonc
{ "sha256": "ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94" }
[
  { "sha1": "149070a5480900347071b7074779531f25a6e3dc" },
  { "md5": "d41d8cd98f00b204e9800998ecf8427e" }
]
```

It is used twice. Before downloading, a file on disk that matches is kept.
After downloading, a file that does not match fails the install.

### ExtractRule

One step of unpacking an artifact. There are three kinds, told apart by the
fields present. The archive is a tar if its name ends in `.tar`, `.tar.gz` or
`.tgz`, and a zip otherwise.

**`ExtractDump`**: the whole archive into a folder.

| Field       | Type       | What it is                            |
| ----------- | ---------- | ------------------------------------- |
| `into`      | `string`   | The folder to unpack into.            |
| `clean?`    | `boolean`  | `true` empties `into` first.          |
| `includes?` | `string[]` | Only these entries.                   |
| `excludes?` | `string[]` | Skip these. Default: `["META-INF/"]`. |

**`ExtractScan`**: the entries that match.

| Field       | Type       | What it is                                     |
| ----------- | ---------- | ---------------------------------------------- |
| `matches`   | `string`   | Which entries to take.                         |
| `into`      | `string`   | The folder to unpack into.                     |
| `includes?` | `string[]` | More patterns. An entry matching any is taken. |
| `excludes?` | `string[]` | Skip these.                                    |
| `strip?`    | `string[]` | Remove a leading part of each entry's name.    |

**`ExtractPick`**: one entry, written to one file.

| Field  | Type     | What it is                                         |
| ------ | -------- | -------------------------------------------------- |
| `file` | `string` | The entry's exact name. Missing fails the install. |
| `into` | `string` | The file to write.                                 |

<!-- prettier-ignore -->
```jsonc
// dump: native libraries
{ "into": "${natives_directory}", "clean": true, "excludes": ["META-INF/"] }

// scan: a JDK, without the archive's top folder
{ "matches": "*", "into": "${java_runtime_dir}/jdk-21", "strip": ["*/"] }

// pick: one binary out of a release archive
{ "file": "dgpuj.exe", "into": "${dgpuj_dir}/dgpuj.exe" }
```

Entry patterns are small on purpose: `lib/` (names starting with it), `lib*`,
`*.so`, `*`, or an exact name. They are not the globs of `cleanup`, and
variables are not filled in. `into` is.

### Launch

How to start the game once the files are in place.

| Field     | Type      | What it is                                   |
| --------- | --------- | -------------------------------------------- |
| `command` | `string`  | The program to run.                          |
| `workdir` | `string`  | The folder it runs in.                       |
| `args?`   | `Val[]`   | Its arguments, in order.                     |
| `envs?`   | `ValDefs` | Environment variables, added to what is set. |

<!-- prettier-ignore -->
```jsonc
{
  "command": "${java_bin}",
  "workdir": "${game_directory}",
  "args": [
    "-Xmx4G",
    { "rules": "allow.os.osx", "value": ["-XstartOnFirstThread"] },
    "-cp", "${classpath}",
    "net.minecraft.client.main.Main",
    "--username", "${auth_player_name}"
  ],
  "envs": { "JAVA_HOME": "${java_home}" }
}
```

One item of the result is one argument of the process. Nothing is split on
spaces, so a path with spaces is safe.

### Val

One item of `args`. A list of them is a `Valset`.

| Form      | Type                                    | What it means                     |
| --------- | --------------------------------------- | --------------------------------- |
| a string  | `string`                                | Always passed.                    |
| an object | `{ value: string \| string[], rules? }` | Passed only where its rules pass. |

<!-- prettier-ignore -->
```jsonc
"-Xmx4G"
{ "rules": "allow.os.osx", "value": "-XstartOnFirstThread" }
{
  "rules": "allow.features.has_custom_resolution",
  "value": ["--width", "${resolution_width}", "--height", "${resolution_height}"]
}
```

`value` is a string or a list, so one condition can cover several arguments.

### CleanupRule

Files to delete after an install: what matches `includes`, less what matches
`excludes`, less **everything this manifest installed**.

| Field       | Type       | What it is                    |
| ----------- | ---------- | ----------------------------- |
| `includes`  | `string[]` | Patterns for files to remove. |
| `excludes?` | `string[]` | Patterns for files to spare.  |

<!-- prettier-ignore -->
```jsonc
{ "includes": ["${game_directory}/mods/*.jar"] }   // every jar in mods that is not this pack's
{
  "includes": ["${game_directory}/config/**"],
  "excludes": ["**/options.txt"]
}
```

| Pattern | Matches                        |
| ------- | ------------------------------ |
| `*`     | Anything within one folder.    |
| `?`     | One character within a folder. |
| `**`    | Anything, across folders.      |
| `{a,b}` | Either `a` or `b`.             |

- A folder goes with its files when it is left empty.
- An `includes` pattern that could reach too far stops the install before
  anything is downloaded: an undefined variable, a relative path, a `..`, or
  no folder before the first wildcard.

## Functions

| Function                                             | What it does                                              |
| ---------------------------------------------------- | --------------------------------------------------------- |
| `decodeManifest(value)`, `parseManifest(text)`       | An object or JSON text into a checked `Manifest`.         |
| `encodeManifest(manifest)`                           | Back to plain JSON.                                       |
| `filterManifest(manifest, platform, features?)`      | The artifacts one machine gets.                           |
| `resolvedArgs(launch, …)`, `resolvedEnvs(launch, …)` | The arguments and environment one machine gets.           |
| `resolveVars(vars)`, `interpolate(text, vars)`       | Fills in `${…}`.                                          |
| `satisfiesRuleset(rules, platform, features?)`       | Whether rules pass on a machine.                          |
| `parseShortRuleset(rules)`                           | Short rules into the long form.                           |
| `valValues(val)`, `extractRules(artifact)`           | Read a field that has two spellings, as a list.           |
| `deduplicateArtifacts(artifacts)`                    | One artifact per path. The later one wins.                |
| `globToRegex(glob)`, `globBase(glob)`                | A cleanup pattern as a `RegExp`, and the folder it is in. |
| `sourceUrl`, `sourceBlob`                            | Build a source.                                           |
| `extractDump`, `extractScan`, `extractPick`          | Build an `extract` step.                                  |

## Every function

Each function, with what it returns.

<!-- prettier-ignore -->
```js
const linux = { name: 'linux', arch: 'x86_64', version: '' };
const mac = { name: 'osx', arch: 'aarch64', version: '' };

// ── a manifest
decodeManifest({ vars: {}, artifacts: [] });    // a Manifest, checked
parseManifest('{"vars":{},"artifacts":[]}');    // the same, from JSON text
encodeManifest(manifest);                       // plain JSON again
decodeManifest({ vars: {}, artifacts: [{ path: 'a', source: { url: 'u' }, nope: 1 }] });
// throws: unknown field `nope`, expected one of `path`, `source`, `size`, …

// ── what one machine gets
filterManifest(manifest, linux);                   // without the artifacts for other systems
filterManifest(manifest, linux, ['java_console']); // with a feature switched on

resolvedArgs(manifest.launch, linux); // ['-Xmx4G', '-cp', '${root}/libs/a.jar', 'Main']
resolvedArgs(manifest.launch, mac);   // ['-Xmx4G', '-XstartOnFirstThread', '-cp', …]
resolvedEnvs(manifest.launch, linux); // { PACK: 'my-pack' }

// ── variables
resolveVars({ root: '/games/pack', mods: '${root}/mods' });
// { root: '/games/pack', mods: '/games/pack/mods' }
interpolate('${root}/mods/${nope}', { root: '/games/pack' });
// '/games/pack/mods/${nope}': an undefined name is left as written

// ── rules
satisfiesRuleset('allow.os.linux', linux);                                       // true
satisfiesRuleset(['allow.os.linux', 'disallow.features.demo'], linux, ['demo']); // false
satisfiesRuleset({ action: 'allow', os: { name: 'osx' } }, linux);               // false
parseShortRuleset(['allow.os.osx', 'disallow.features.demo']);
// [{ action: 'allow', os: { name: 'osx' } }, { action: 'disallow', features: { demo: true } }]

// ── fields with two spellings
valValues('-Xmx4G');                                     // ['-Xmx4G']
valValues({ rules: 'allow.os.osx', value: ['a', 'b'] }); // ['a', 'b']
extractRules(artifact);                                  // always a list, whether one step or several

// ── artifacts and patterns
deduplicateArtifacts([first, second]);   // same path twice: only `second` is left
globBase('/games/pack/mods/*.jar');      // '/games/pack/mods'
globToRegex('/games/pack/mods/*.jar');   // /^\/games\/pack\/mods\/[^/]*\.jar$/

// ── builders
sourceUrl('https://example.com/a.jar'); // { url: 'https://example.com/a.jar' }
sourceBlob(id);                         // { blob: '3d862eef…' }
extractDump('${root}/natives');         // { into: '${root}/natives' }
extractScan('*', '${root}/jdk');        // { matches: '*', into: '${root}/jdk' }
extractPick('LICENSE', '${root}/LICENSE.txt');
```

`resolvedArgs` picks the arguments. It does not fill in `${…}`; that is
`interpolate`.

## Documentation

- [The format](https://harmoniya-net.github.io/opys/format/): every element, one page each
- [`@opys/bundle`](https://www.npmjs.com/package/@opys/bundle): the file a manifest is stored in

Part of [opys](https://github.com/harmoniya-net/opys).
