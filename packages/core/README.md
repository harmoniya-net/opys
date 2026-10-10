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

Every part of a manifest is something a config writes, or a plugin writes for
it. `opys build` turns the config into the manifest.

```js
// opys.config.mjs
export default defineConfig({
  plugins: [minecraft({ version: '1.21.1' }), java({ version: '21' })],
  manifest: {
    command: '@minecraft.command',
    args: ['@minecraft.jvmArgs', '-Xmx4G', '@minecraft.mainClass'],
    workdir: '${game_directory}',
    cleanup: [{ includes: ['${game_directory}/mods/*.jar'] }],
  },
});
```

## The format

Every structure of the format: what it is, how a config writes it, and what
it is in the manifest. The TypeScript type of the same name is exported.

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

A `${name}` inside a string is a variable. Each example is a part of
`opys.config.mjs`, then the same thing in `manifest.json`.

### Manifest

A whole installation: what to install, how to start it, what to delete. In a
bundle it is the entry `manifest.json`.

<!-- prettier-ignore -->
```js
// opys.config.mjs
export default defineConfig({
  plugins: [],
  manifest: {
    vars: { root: '/games/pack' },                    // ValDefs: named values
    artifacts: [                                      // Artifact[]: the files to install
      {
        path: '${root}/libs/a.jar',
        source: { url: 'https://example.com/a.jar' },
        integrity: { sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709' },
      },
    ],
    command: 'java',                                  // these three become `launch`
    args: ['-cp', '${root}/libs/a.jar', 'com.example.Main'],
    workdir: '${root}',
    cleanup: [{ includes: ['${root}/mods/*.jar'] }],  // CleanupRule[]: what to delete after installing
  },
});
```

<!-- prettier-ignore -->
```jsonc
// manifest.json
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

- Every field may be left out. Without `launch`, a manifest can be installed
  and not started.
- Plugins add to `vars`, `artifacts` and the launch line. What a config
  writes by hand wins over a plugin.

### ValDefs

Variables: a map from a name to its value. Used by `vars` and by
`launch.envs`.

<!-- prettier-ignore -->
```js
manifest: {
  vars: {
    root: '/games/pack',                // a string: the same on every machine
    game_directory: '${root}/',         // a value may use other variables
    classpath_separator: [              // a list of choices: one per platform, the last that passes wins
      { value: ':' },                   //   no rules: always passes, so it is the default
      { value: ';', rules: 'allow.os.windows' },
    ],
  },
  envs: { PACK: 'my-pack' },            // the same shape, for the game's environment
}
```

<!-- prettier-ignore -->
```jsonc
"vars": {
  "root": "/games/pack",
  "game_directory": "${root}/",
  "classpath_separator": [
    { "value": ":" },
    { "value": ";", "rules": "allow.os.windows" }
  ]
}
```

- A cycle between variables is an error.
- A name nothing defines is left as written: the game receives `${username}`.
- `\${` is a literal `${`.

### ConditionalVal

One choice of a variable's value.

<!-- prettier-ignore -->
```js
vars: {
  java_bin: [
    {
      value: '${java_home}/bin/java',       // string: the value
    },
    {
      value: '${java_home}/bin/javaw.exe',
      rules: 'allow.os.windows',            // Ruleset, optional: where it applies. Left out: everywhere
    },
  ],
}
```

<!-- prettier-ignore -->
```jsonc
{ "value": "${java_home}/bin/javaw.exe", "rules": "allow.os.windows" }
```

If no choice passes, the variable is not defined at all.

### Ruleset

Where something applies. One `Rule`, or a list of them. **Every** rule must
pass.

<!-- prettier-ignore -->
```js
artifacts: [
  { path: '…', source: { url: '…' }, rules: 'allow.os.linux' },                              // one rule
  { path: '…', source: { url: '…' }, rules: ['allow.os.linux', 'disallow.features.demo'] },  // on Linux, with `demo` off
]

// or added to what a plugin installs
forge({ version: '1.20.1' }).addRule('**/*-natives-windows.jar', 'allow.os.windows')
```

<!-- prettier-ignore -->
```jsonc
"rules": "allow.os.linux"
"rules": ["allow.os.linux", "disallow.features.demo"]
```

Two `allow` rules for two systems pass nowhere, since no machine is both.
"Windows or Linux" is `disallow.os.osx`.

### Rule

One condition. It has two spellings that mean the same, and a reader accepts
both.

<!-- prettier-ignore -->
```js
rules: 'allow.os.osx'                                              // short: '<action>.<kind>.<value>'
rules: { action: 'allow', os: { name: 'osx' } }                    // long: the form the game's own files use

rules: 'allow.arch.aarch64'
rules: { action: 'allow', os: { arch: 'aarch64' } }

rules: 'disallow.features.is_demo_user'
rules: { action: 'disallow', features: { is_demo_user: true } }

// the long form, field by field
rules: {
  action: 'allow',                          // 'allow' | 'disallow'
  os: { name: 'osx', arch: 'aarch64' },     // optional: name, arch, version. All the fields given must match
  // features: { is_demo_user: true },      // or this: each feature must be on (true) or off (false)
}
```

What the short form can say:

| Rule                          | Passes                            |
| ----------------------------- | --------------------------------- |
| `allow.os.windows`            | On Windows. Also `linux`, `osx`.  |
| `allow.arch.aarch64`          | On ARM64. Also `x86_64`.          |
| `allow.features.java_console` | When that feature is switched on. |
| `allow.os.osx@^14`            | On macOS whose version matches.   |
| `disallow.os.osx`             | Everywhere except macOS.          |
| `allow`, `disallow`           | Always, never.                    |

A `disallow` rule passes when its condition does **not** hold.

### Artifact

One file of the installation: where it goes, where it comes from, how it is
checked.

<!-- prettier-ignore -->
```js
manifest: {
  artifacts: [
    {
      path: '${game_directory}/mods/tweaks.jar',                // string: where the file is written
      source: { url: 'https://example.com/tweaks-1.0.jar' },    // Source: where its bytes come from
      integrity: { sha256: 'ce79869e…' },                       // Integrity, optional: the hash it must have
      size: 110704,                                             // number, optional: bytes. For progress, not for checking
      rules: 'allow.os.linux',                                  // Ruleset, optional: which machines get it. Left out: all
      extract: { into: '${natives_directory}', clean: true },   // ExtractRule or a list, optional: how to unpack it
      metadata: { from: 'my own build' },                       // anything, optional: notes. An installer ignores it
    },
  ],
}
```

<!-- prettier-ignore -->
```jsonc
{
  "path": "${game_directory}/mods/tweaks.jar",
  "source": { "url": "https://example.com/tweaks-1.0.jar" },
  "integrity": { "sha256": "ce79869e…" },
  "size": 110704,
  "rules": "allow.os.linux",
  "extract": { "into": "${natives_directory}", "clean": true },
  "metadata": { "from": "my own build" }
}
```

- Any other field is an error. A field a reader does not understand could
  change what gets installed.
- Without `integrity` a file is never checked: once it exists it is kept, even
  if the source changed.
- Most artifacts come from plugins. One written by hand replaces a plugin's
  at the same `path`.

### Source

Where an artifact's bytes come from. One of two, told apart by the field
present.

<!-- prettier-ignore -->
```js
source: { url: 'https://example.com/a-1.0.jar' }   // a download. The URL may use variables
source: { blob: '3d862eef…' }                      // a carried file: the bundle's entry blobs/<blob>
```

A config rarely writes a `blob` itself. The `files` plugin of `@opys/dev`
carries a folder, and each file becomes one:

<!-- prettier-ignore -->
```js
plugins: [files({ from: 'config', to: (file) => '${game_directory}/config/' + file.rel })]
```

<!-- prettier-ignore -->
```jsonc
{ "url": "https://example.com/a-1.0.jar" }
{ "blob": "3d862eef2acd67a2dcb60351bda23e6ad7ebd51939b393eede30ec140ba3c20d" }
```

A blob is named by the sha256 of its content, in lowercase hex. The name is
the hash, so a blob artifact needs no `integrity`. Both fields at once is an
error.

### Integrity

The hash a file must have. One entry, or a list; with a list, matching any
one is enough.

<!-- prettier-ignore -->
```js
integrity: { sha256: 'ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94' }  // 64 hex characters
integrity: { sha1: '149070a5480900347071b7074779531f25a6e3dc' }                            // 40
integrity: { md5: 'd41d8cd98f00b204e9800998ecf8427e' }                                     // 32
integrity: [                                                                               // any one of these
  { sha1: '149070a5480900347071b7074779531f25a6e3dc' },
  { md5: 'd41d8cd98f00b204e9800998ecf8427e' },
]
```

<!-- prettier-ignore -->
```jsonc
"integrity": { "sha256": "ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94" }
```

It is used twice. Before downloading, a file on disk that matches is kept.
After downloading, a file that does not match fails the install.

### ExtractRule

One step of unpacking an artifact. There are three kinds, told apart by the
fields present. The archive is a tar if its name ends in `.tar`, `.tar.gz` or
`.tgz`, and a zip otherwise.

<!-- prettier-ignore -->
```js
// ExtractDump: the whole archive into a folder
extract: {
  into: '${natives_directory}',     // string: the folder to unpack into
  clean: true,                      // optional: empty `into` first
  includes: ['*.so'],               // optional: only these entries
  excludes: ['META-INF/'],          // optional: skip these. This is the default
}

// ExtractScan: the entries that match
extract: {
  matches: '*',                     // string: which entries to take
  into: '${java_runtime_dir}/jdk-21',
  includes: ['bin/', 'lib/'],       // optional: more patterns. An entry matching any is taken
  excludes: ['*.txt'],              // optional: skip these
  strip: ['*/'],                    // optional: remove a leading part of each entry's name
}

// ExtractPick: one entry, written to one file
extract: {
  file: 'dgpuj.exe',                // string: the entry's exact name. Missing fails the install
  into: '${dgpuj_dir}/dgpuj.exe',   // string: the file to write
}

// several steps on one archive
extract: [
  { file: 'LICENSE', into: '${root}/LICENSE.txt' },
  { matches: 'bin/*', into: '${root}/bin' },
]
```

<!-- prettier-ignore -->
```jsonc
{ "into": "${natives_directory}", "clean": true, "excludes": ["META-INF/"] }
{ "matches": "*", "into": "${java_runtime_dir}/jdk-21", "strip": ["*/"] }
{ "file": "dgpuj.exe", "into": "${dgpuj_dir}/dgpuj.exe" }
```

Entry patterns are small on purpose: `lib/` (names starting with it), `lib*`,
`*.so`, `*`, or an exact name. They are not the globs of `cleanup`, and
variables are not filled in. `into` is.

### Launch

How to start the game once the files are in place. A config writes its
fields straight under `manifest`.

<!-- prettier-ignore -->
```js
manifest: {
  command: '@minecraft.command',        // string: the program to run
  workdir: '${game_directory}',         // string: the folder it runs in
  args: [                               // Val[], optional: its arguments, in order
    '-Xmx4G',
    '@minecraft.jvmArgs',               //   '@plugin.group': what a plugin offers, filled in by `opys build`
    '@minecraft.mainClass',
    '--username', '${auth_player_name}',
  ],
  envs: { JAVA_HOME: '${java_home}' },  // ValDefs, optional: environment variables, added to what is set
}
```

<!-- prettier-ignore -->
```jsonc
"launch": {
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

- A manifest holds no `@…` reference: each is replaced when it is built.
- One item of the result is one argument of the process. Nothing is split on
  spaces, so a path with spaces is safe.

### Val

One item of `args`. A list of them is a `Valset`.

<!-- prettier-ignore -->
```js
args: [
  '-Xmx4G',                                               // a string: always passed
  { rules: 'allow.os.osx', value: '-XstartOnFirstThread' }, // an object: passed only where its rules pass
  {
    rules: 'allow.features.has_custom_resolution',
    value: ['--width', '${resolution_width}', '--height', '${resolution_height}'], // a list: several arguments, one condition
  },
]
```

<!-- prettier-ignore -->
```jsonc
"-Xmx4G"
{ "rules": "allow.os.osx", "value": "-XstartOnFirstThread" }
{
  "rules": "allow.features.has_custom_resolution",
  "value": ["--width", "${resolution_width}", "--height", "${resolution_height}"]
}
```

`rules` may be left out of an object, which then always passes.

### CleanupRule

Files to delete after an install: what matches `includes`, less what matches
`excludes`, less **everything this manifest installed**.

<!-- prettier-ignore -->
```js
manifest: {
  cleanup: [
    { includes: ['${game_directory}/mods/*.jar'] },   // string[]: patterns for files to remove
    {
      includes: ['${game_directory}/config/**'],
      excludes: ['**/options.txt'],                   // string[], optional: patterns for files to spare
    },
  ],
}
```

<!-- prettier-ignore -->
```jsonc
"cleanup": [
  { "includes": ["${game_directory}/mods/*.jar"] },
  { "includes": ["${game_directory}/config/**"], "excludes": ["**/options.txt"] }
]
```

| Pattern | Matches                        |
| ------- | ------------------------------ |
| `*`     | Anything within one folder.    |
| `?`     | One character within a folder. |
| `**`    | Anything, across folders.      |
| `{a,b}` | Either `a` or `b`.             |

- The first rule removes every jar in `mods` that is not this pack's.
- A folder goes with its files when it is left empty.
- An `includes` pattern that could reach too far stops the install before
  anything is downloaded: an undefined variable, a relative path, a `..`, or
  no folder before the first wildcard.

## Everything together

One config that writes every structure above, and the manifest `opys build`
makes of it.

<!-- prettier-ignore -->
```js
// opys.config.mjs
import { defineConfig, files } from '@opys/dev';

export default defineConfig({
  output: 'game.opys',
  plugins: [
    // Source { blob }: each file of the folder is carried in the bundle
    files({ from: 'config', to: (file) => '${game_directory}/config/' + file.rel }),
  ],
  manifest: {
    // ValDefs
    vars: {
      root: '/games/pack',
      game_directory: '${root}/',
      natives_directory: '${root}/natives',
      // ConditionalVal: the last choice that passes wins
      java_bin: [
        { value: '${root}/jdk/bin/java' },
        { value: '${root}/jdk/bin/javaw.exe', rules: 'allow.os.windows' },
      ],
    },

    // Artifact[]
    artifacts: [
      {
        path: '${root}/libs/game.jar',
        source: { url: 'https://example.com/game-1.0.jar' },                    // Source { url }
        integrity: { sha256: 'ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94' }, // Integrity
        size: 110704,
        metadata: { from: 'my own build' },
      },
      {
        path: '${root}/natives-linux.zip',
        source: { url: 'https://example.com/natives-linux.zip' },
        integrity: [                                                            // Integrity: any one of these
          { sha1: '149070a5480900347071b7074779531f25a6e3dc' },
          { md5: 'd41d8cd98f00b204e9800998ecf8427e' },
        ],
        rules: ['allow.os.linux', { action: 'allow', os: { arch: 'x86_64' } }], // Ruleset: a short Rule and a long one
        extract: { into: '${natives_directory}', clean: true },                 // ExtractDump
      },
      {
        path: '${root}/jdk.tar.gz',
        source: { url: 'https://example.com/jdk-21.tar.gz' },
        integrity: { sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08' },
        extract: [
          { matches: '*', into: '${root}/jdk', strip: ['*/'] },                 // ExtractScan
          { file: 'jdk-21/LICENSE', into: '${root}/JDK-LICENSE.txt' },          // ExtractPick
        ],
      },
    ],

    // Launch
    command: '${java_bin}',
    workdir: '${game_directory}',
    args: [
      '-Xmx4G',                                                                 // Val: a string
      { rules: 'allow.os.osx', value: '-XstartOnFirstThread' },                 // Val: only where its rules pass
      '-cp', '${root}/libs/game.jar',
      'com.example.Main',
      { rules: 'allow.features.fullscreen', value: ['--fullscreen', 'true'] },
    ],
    envs: { PACK: 'my-pack' },

    // CleanupRule[]
    cleanup: [
      { includes: ['${game_directory}/mods/*.jar'] },
      { includes: ['${game_directory}/config/**'], excludes: ['**/options.txt'] },
    ],
  },
});
```

<!-- prettier-ignore -->
```jsonc
// manifest.json
{
  "vars": {
    "game_directory": "${root}/",
    "java_bin": [
      { "value": "${root}/jdk/bin/java" },
      { "value": "${root}/jdk/bin/javaw.exe", "rules": "allow.os.windows" }
    ],
    "natives_directory": "${root}/natives",
    "root": "/games/pack"
  },
  "launch": {
    "command": "${java_bin}",
    "workdir": "${game_directory}",
    "args": [
      "-Xmx4G",
      { "rules": "allow.os.osx", "value": ["-XstartOnFirstThread"] },
      "-cp", "${root}/libs/game.jar",
      "com.example.Main",
      { "rules": "allow.features.fullscreen", "value": ["--fullscreen", "true"] }
    ],
    "envs": { "PACK": "my-pack" }
  },
  "artifacts": [
    {
      "path": "${game_directory}/config/options.txt",
      "source": { "blob": "281c00f49eb59e9c9ec4da85960033d12444864f8f5b8392e6f5c6941f9f8caa" },
      "size": 7
    },
    {
      "path": "${root}/libs/game.jar",
      "source": { "url": "https://example.com/game-1.0.jar" },
      "size": 110704,
      "integrity": { "sha256": "ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94" },
      "metadata": { "from": "my own build" }
    },
    {
      "path": "${root}/natives-linux.zip",
      "source": { "url": "https://example.com/natives-linux.zip" },
      "rules": ["allow.os.linux", "allow.arch.x86_64"],
      "integrity": [
        { "sha1": "149070a5480900347071b7074779531f25a6e3dc" },
        { "md5": "d41d8cd98f00b204e9800998ecf8427e" }
      ],
      "extract": { "into": "${natives_directory}", "clean": true }
    },
    {
      "path": "${root}/jdk.tar.gz",
      "source": { "url": "https://example.com/jdk-21.tar.gz" },
      "integrity": { "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08" },
      "extract": [
        { "matches": "*", "into": "${root}/jdk", "strip": ["*/"] },
        { "file": "jdk-21/LICENSE", "into": "${root}/JDK-LICENSE.txt" }
      ]
    }
  ],
  "cleanup": [
    { "includes": ["${game_directory}/mods/*.jar"] },
    { "includes": ["${game_directory}/config/**"], "excludes": ["**/options.txt"] }
  ]
}
```

What changed on the way:

- The folder's file became a `blob`, with its `size`.
- A rule written in the long form is stored in the short one where it has
  one: `{ action: 'allow', os: { arch: 'x86_64' } }` is `"allow.arch.x86_64"`.
- A `value` written as one string is stored as a list of one.
- `command`, `workdir`, `args` and `envs` moved under `launch`.

## From code

Reading a manifest yourself is rare: `opys` and
[`@opys/runtime`](https://www.npmjs.com/package/@opys/runtime) do it for
you. For a tool of your own, check a manifest, then ask what one machine
gets from it.

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

## Functions

All of them are imported from `@opys/core`.

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
import {
  decodeManifest, parseManifest, encodeManifest,          // a manifest
  filterManifest, resolvedArgs, resolvedEnvs,             // what one machine gets
  resolveVars, interpolate,                               // variables
  satisfiesRuleset, parseShortRuleset,                    // rules
  valValues, extractRules,                                // fields with two spellings
  deduplicateArtifacts, globBase, globToRegex,            // artifacts and patterns
  sourceUrl, sourceBlob, extractDump, extractScan, extractPick, // builders
} from '@opys/core';

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
