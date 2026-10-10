# @opys/runtime

[![npm](https://img.shields.io/npm/v/@opys/runtime.svg)](https://www.npmjs.com/package/@opys/runtime)

The part of opys a launcher needs. It takes a bundle, installs what the
bundle lists, and starts the game. It builds nothing: no config, no plugins.

```sh
npm install @opys/runtime
```

Needs Node.js 20 or newer.

## Example

```js
import { launch, RuntimeError } from '@opys/runtime';

try {
  const child = await launch(
    { url: 'https://example.com/packs/game.opys' },
    {
      vars: {
        root: '/home/player/.local/share/my-pack',
        username: 'Player',
        uuid: '00000000-0000-0000-0000-000000000001',
        token: '0',
      },
      install: {
        onProgress(p) {
          if (p.phase === 'download')
            console.log(`${p.fetched}/${p.total} files`);
        },
      },
    },
  );
  child.on('exit', (code) => console.log('the game exited with', code));
} catch (err) {
  if (err instanceof RuntimeError) console.error(`${err.code}: ${err.message}`);
  else throw err;
}
```

## Functions

| Function                        | Installs | Starts the game | Returns        |
| ------------------------------- | -------- | --------------- | -------------- |
| `install(source, options?)`     | yes      | no              | nothing        |
| `launch(source, options?)`      | yes      | yes             | `ChildProcess` |
| `prepare(source, options?)`     | yes      | no              | `LaunchSpec`   |
| `buildLaunch(source, options?)` | no       | no              | `LaunchSpec`   |
| `spawnLaunch(spec)`             | no       | yes             | `ChildProcess` |
| `readHead(source)`              | no       | no              | `Head`         |
| `currentPlatform()`             |          |                 | `OsOptions`    |

`launch` is `prepare`, then `spawnLaunch`. Use the two yourself to change
what is started, or to spawn it your own way.

`readHead` is for the settings screen. It returns what the bundle says about
itself, `{ format, options }`, and `options` is what a player may set. It
reads the head only: a bundle behind a URL is not downloaded, just its first
bytes.

## Where the pack comes from

The first argument of every function.

| Source         | What it is                                                       |
| -------------- | ---------------------------------------------------------------- |
| `{ url }`      | A bundle to download. It is downloaded whole before installing.  |
| `{ bundle }`   | The path of a bundle on disk.                                    |
| `{ manifest }` | A manifest in memory. It cannot carry files, only download them. |

## Options

| Option            | Where               | What it does                                      |
| ----------------- | ------------------- | ------------------------------------------------- |
| `vars`            | everywhere          | Values for the bundle's variables.                |
| `features`        | everywhere          | Switches such as `java_console`.                  |
| `platform`        | everywhere          | Install for another OS or CPU. Default: this one. |
| `cwd`             | `launch`, `prepare` | Overrides the working directory.                  |
| `install`         | `launch`, `prepare` | Install options, or `false` to skip installing.   |
| `onProgress`      | `install`           | The progress callback.                            |
| `concurrency`     | `install`           | Parallel downloads. Default 8.                    |
| `verifyIntegrity` | `install`           | `false` skips hash checks. Leave it on.           |

Everything that belongs to the player's machine, such as `root`, is passed
as `vars`. A bundle holds none of it.

**Always pass `root`.** Nothing is written or deleted outside it, and your
value wins over the bundle's. A bundle that names a path anywhere else is
refused before anything is downloaded, with the code `manifest`.

## What comes back

### LaunchSpec

What to start, with every variable filled in.

| Field     | Type                     | What it is                       |
| --------- | ------------------------ | -------------------------------- |
| `command` | `string`                 | The program.                     |
| `args`    | `string[]`               | Its arguments, for this machine. |
| `workdir` | `string`                 | The directory to start it in.    |
| `envs`    | `Record<string, string>` | Environment variables to add.    |

### Progress

`onProgress` is called with one of these. Tell them apart by `phase`.

| `phase`          | Also has                                             | When                         |
| ---------------- | ---------------------------------------------------- | ---------------------------- |
| `resolve`        |                                                      | The bundle is being read.    |
| `download`       | `fetched`, `total`, `skipped`, `bytes`, `totalBytes` | After each file. The totals. |
| `download:start` | `path`, `totalBytes`                                 | One file begins.             |
| `download:bytes` | `path`, `bytes`                                      | One file received more.      |
| `download:done`  | `path`                                               | One file finished.           |
| `verify`         |                                                      | Hashes are being checked.    |
| `extract`        | `count`                                              | Archives are being unpacked. |
| `cleanup`        | `removed`, `directories`                             | Stale files were deleted.    |

`totalBytes` is the sum of the sizes the bundle declares. It is 0 for a file
listed without a size.

### Errors

Every failure is a `RuntimeError` with a `code`. Decide from the code, never
from the message.

| `code`       | Class             | Also has                | What happened                      |
| ------------ | ----------------- | ----------------------- | ---------------------------------- |
| `network`    | `NetworkError`    | `url`, `status`, `body` | A download failed.                 |
| `integrity`  | `IntegrityError`  | `paths`                 | A file did not match its hash.     |
| `extraction` | `ExtractionError` | `artifactPath`, `cause` | An archive could not be unpacked.  |
| `manifest`   | `RuntimeError`    |                         | The bundle is wrong or unreadable. |
| `io`         | `RuntimeError`    |                         | A file could not be written.       |
| `cancelled`  | `RuntimeError`    |                         | The install was stopped.           |
| `other`      | `RuntimeError`    |                         | Anything else.                     |

## Every function

Each function, in each way it is used.

<!-- prettier-ignore -->
```js
const source = { bundle: './game.opys' };
const vars = { root: '/games/pack', username: 'Player', uuid: '0000…', token: '0' };

// install only
await install(source, { vars });
await install(source, { vars, features: ['java_console'], concurrency: 16 });
await install(source, { vars, platform: { name: 'windows', version: '10.0', arch: 'x86_64' } });
await install({ url: 'https://example.com/game.opys' }, { vars, onProgress: (p) => console.log(p.phase) });

// install and start
const child = await launch(source, { vars });
await launch(source, { vars, install: false });          // already installed
await launch(source, { vars, cwd: '/games/pack/saves' }); // another working directory
await launch(source, { vars, install: { concurrency: 4 } });

// install, then start it yourself
const spec = await prepare(source, { vars });
// { command: '/games/pack/runtimes/jdk-21/bin/java', args: [...], workdir: '/games/pack/', envs: { JAVA_HOME: '…' } }
spawnLaunch({ ...spec, args: ['-Xmx8G', ...spec.args] });

// what would be started, with nothing installed
await buildLaunch(source, { vars });

// what a player may set, before anything is installed
const head = await readHead({ url: 'https://example.com/game.opys' });
// { format: 1, options: [{ slider: 'xmx', title: 'RAM', min: 2048, max: 16384, step: 512, default: 4096 }] }
await readHead({ manifest }); // undefined: a manifest in memory is in no bundle

// a manifest in memory: fine as long as it carries no files
await install({ manifest: { vars: {}, artifacts: [] } });

currentPlatform(); // { name: 'linux', version: '', arch: 'x86_64' }
```

## Documentation

- [Launcher integration](https://harmoniya-net.github.io/opys/basics/launcher): a launcher, step by step
- [`@opys/bundle`](https://www.npmjs.com/package/@opys/bundle): the file it installs from

Part of [opys](https://github.com/harmoniya-net/opys).
