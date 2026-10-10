# @opys/mojang

[![npm](https://img.shields.io/npm/v/@opys/mojang.svg)](https://www.npmjs.com/package/@opys/mojang)

Parsers for the files Mojang publishes: the version list, a version file, its
libraries, arguments and asset index. Use it to write a loader plugin or a
tool of your own. A pack author never imports it.

```sh
npm install @opys/mojang
```

## Example

Find a version, then read what it is made of.

```js
import {
  VERSION_MANIFEST_URL,
  findVersion,
  parseClient,
  parseVersionManifest,
  satisfiesRuleset,
} from '@opys/mojang';

const list = parseVersionManifest(
  await (await fetch(VERSION_MANIFEST_URL)).json(),
);
const version = findVersion(list, '1.21.1');
if (!version) throw new Error('no such version');

const client = parseClient(await (await fetch(version.url)).json());
client.mainClass; // the class the game starts from

const linux = { name: 'linux', version: '6.12', arch: 'x86_64' };
client.libraries.filter((lib) => satisfiesRuleset(lib.rules, linux)); // what Linux gets
```

The package does no network or file access. You fetch, it parses.

## What it reads

| Mojang's file               | Parser                 | Gives             |
| --------------------------- | ---------------------- | ----------------- |
| The version list            | `parseVersionManifest` | `VersionManifest` |
| A version file, `<id>.json` | `parseClient`          | `Client`          |
| Its `libraries`             | `parseLibraries`       | `Library[]`       |
| Its `arguments`             | `parseArguments`       | `Arguments`       |
| An asset index              | `parseAssetManifest`   | `AssetManifest`   |
| A Maven coordinate          | `parseMaven`           | `MavenCoord`      |
| A list of rules             | `decodeRuleset`        | `MojangRuleset`   |

### Client

A version file, read.

| Field        | Type             | What it is                                    |
| ------------ | ---------------- | --------------------------------------------- |
| `id`         | `string`         | The version: `'1.21.1'`.                      |
| `mainClass`  | `string`         | The class the game starts from.               |
| `libraries`  | `Library[]`      | Its libraries, each with its rules.           |
| `args`       | `Arguments`      | The game and JVM arguments.                   |
| `downloads`  | `Downloads`      | The client jar, and the server's if any.      |
| `assetIndex` | `AssetIndex`     | Where the asset index is.                     |
| `java`       | `JavaVersion`    | The Java it asks for: `{ majorVersion: 21 }`. |
| `metadata`   | `ClientMetadata` | Its type and release time.                    |
| `logging?`   | `Logging`        | The log4j config, when it has one.            |

### Library

| Field      | Type            | What it is                                   |
| ---------- | --------------- | -------------------------------------------- |
| `name`     | `MavenCoord`    | The coordinate, parsed.                      |
| `artifact` | `Artifact`      | `path`, `url`, `sha1` and `size` of the jar. |
| `rules`    | `MojangRuleset` | Which machines it is for.                    |
| `native`   | `boolean`       | Whether it is a natives jar.                 |

### Arguments

| Field    | Type               | What it is                                         |
| -------- | ------------------ | -------------------------------------------------- |
| `game`   | `MojangArgValue[]` | The game's arguments.                              |
| `jvm`    | `MojangArgValue[]` | The JVM's arguments.                               |
| `legacy` | `boolean`          | Whether it came from the old `minecraftArguments`. |

An argument is a string, or `{ rules, value }` for one that depends on the
machine.

### MavenCoord

| Field         | Type     | In `org.lwjgl:lwjgl:3.3.3:natives-linux` |
| ------------- | -------- | ---------------------------------------- |
| `groupId`     | `string` | `org.lwjgl`                              |
| `artifactId`  | `string` | `lwjgl`                                  |
| `version?`    | `string` | `3.3.3`                                  |
| `classifier?` | `string` | `natives-linux`                          |

## Rules

Evaluation of Mojang's rule format. The types are
[`@opys/mojang-rules`](https://www.npmjs.com/package/@opys/mojang-rules)'s
and are exported from here too.

| Function                                   | Passes when                          |
| ------------------------------------------ | ------------------------------------ |
| `satisfiesRuleset(rules, os, features?)`   | Every rule passes. `[]` always does. |
| `satisfiesRule(rule, os, features?)`       | The one rule passes.                 |
| `satisfiesOs(constraint, os)`              | The machine matches.                 |
| `satisfiesFeatures(constraint, features?)` | The features match.                  |

These take the object form only. The short form, `'allow.os.linux'`, is
opys's own, and [`@opys/core`](https://www.npmjs.com/package/@opys/core)
reads both.

## Every function

Each function, with what it returns.

<!-- prettier-ignore -->
```js
const linux = { name: 'linux', version: '6.12', arch: 'x86_64' };

// the version list
VERSION_MANIFEST_URL;                  // 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json'
const list = parseVersionManifest(json);
findVersion(list, '1.21.1');           // { id: '1.21.1', type: 'release', url, sha1, … }
findVersion(list, '9.9');              // undefined
latestRelease(list);                   // the Version that `latest.release` names

// a version file
parseClient(json);                     // a Client
parseClient({});                       // throws: missing field `id`
parseLibraries(json.libraries);        // [{ name, artifact, rules: [], native: false }]

// arguments: the modern object, or the old string
parseArguments({ game: ['--demo'], jvm: ['-cp', '${classpath}'] });
// { game: ['--demo'], jvm: ['-cp', '${classpath}'], legacy: false }
parseArguments('--username ${auth_player_name}');
// { game: ['--username', '${auth_player_name}'], jvm: LEGACY_JVM_ARGS, legacy: true }
LEGACY_JVM_ARGS;                       // ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}']

// a loader's arguments on top of the game's: the patch's go after the base's
mergeArgs(base, patch);
mergeArgs(base, legacyPatch);          // base, unchanged: an old-style patch adds nothing

// assets
parseAssetManifest(json);              // { objects: { 'icons/icon_16x16.png': { hash, size } } }
assetPath('5ff04807c356f1beed0b86ccf659b44b9983e3fa'); // '5f/5ff04807…'
assetUrl('5ff04807c356f1beed0b86ccf659b44b9983e3fa');  // 'https://resources.download.minecraft.net/5f/5ff04807…'

// maven
const coord = parseMaven('org.lwjgl:lwjgl:3.3.3:natives-linux');
// { groupId: 'org.lwjgl', artifactId: 'lwjgl', version: '3.3.3', classifier: 'natives-linux' }
encodeMaven({ groupId: 'org.lwjgl', artifactId: 'lwjgl', version: '3.3.3' }); // 'org.lwjgl:lwjgl:3.3.3'
isNativeMaven(coord);                  // true
mavenMatchesIgnoringVersion(parseMaven('a:b:1'), parseMaven('a:b:2')); // true

// rules
decodeRuleset([{ action: 'allow', os: { name: 'osx' } }]); // the same, checked
decodeRuleset('allow.os.osx');         // throws: the short form is @opys/core's
encodeRuleset([{ action: 'allow' }]);  // [{ action: 'allow' }]

satisfiesRuleset([], linux);                                               // true
satisfiesRuleset([{ action: 'allow' }, { action: 'disallow', os: { name: 'osx' } }], linux); // true
satisfiesRule({ action: 'disallow', os: { name: 'osx' } }, linux);         // true
satisfiesRule({ action: 'allow', features: { is_demo_user: true } }, linux);                   // false
satisfiesRule({ action: 'allow', features: { is_demo_user: true } }, linux, ['is_demo_user']); // true
satisfiesOs({ name: 'linux', arch: 'x86_64' }, linux);                     // true
satisfiesFeatures({ is_demo_user: false }, []);                            // true
```

## Documentation

- [Rules](https://harmoniya-net.github.io/opys/format/rules): how a manifest uses them
- [How opys is built](https://harmoniya-net.github.io/opys/reference/architecture)

Part of [opys](https://github.com/harmoniya-net/opys).
