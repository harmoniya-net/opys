# Launcher integration

`@opys/runtime` is the part of opys your players need. Give it a bundle and
it installs the game and starts it.

It runs anywhere Node.js 20+ runs: Electron, the Node side of a Tauri app, a
script.

```sh
npm install @opys/runtime
```

## The whole thing

```js
import { launch } from '@opys/runtime';

const child = await launch(
  { url: 'https://example.com/packs/game.opys' },
  {
    vars: {
      root: '/home/player/.local/share/my-pack',
      username: 'Player',
      uuid: '00000000-0000-0000-0000-000000000001',
      token: '0',
    },
  },
);

child.on('exit', (code) => console.log('game exited with', code));
```

That downloads the bundle, installs or updates the game, and starts it. You
get back a normal Node `ChildProcess`.

**Two arguments, two owners.** The bundle is what the pack author decided.
`vars` is what only this machine knows. Always pass `root`, as an absolute
path. All names: [Variables](/plugins/minecraft#variables).

**Why a separate package:** the runtime knows nothing about Forge or
Modrinth. All of that was settled when the bundle was built, so your
launcher ships something small.

## Where the bundle comes from

| Source         | Use it when                                        |
| -------------- | -------------------------------------------------- |
| `{ url }`      | The pack is on a server. Simplest.                 |
| `{ bundle }`   | You downloaded it yourself. Pass an absolute path. |
| `{ manifest }` | A manifest in memory, with no carried files.       |

`{ url }` downloads the bundle on every call. To avoid that, fetch it when
it changes and pass `{ bundle }`.

## Showing progress

```js
await launch(source, {
  vars,
  install: {
    onProgress(p) {
      if (p.phase === 'download') {
        bar.set(p.totalBytes ? p.bytes / p.totalBytes : p.fetched / p.total);
      }
    },
  },
});
```

An install goes through phases, in order. `p.phase` tells you which:

| `phase`          | Means                      | Extra fields                              |
| ---------------- | -------------------------- | ----------------------------------------- |
| `resolve`        | Started.                   |                                           |
| `download`       | Overall download position. | `fetched`, `total`, `bytes`, `totalBytes` |
| `download:start` | One file started.          | `path`, `totalBytes`                      |
| `download:bytes` | One file moved forward.    | `path`, `bytes`                           |
| `download:done`  | One file finished.         | `path`                                    |
| `verify`         | Checking hashes.           |                                           |
| `extract`        | Unpacking archives.        | `count`                                   |
| `cleanup`        | Old files were deleted.    | `removed`, `directories`                  |

Files already on disk with the right hash are skipped. So a second install
is fast, and an interrupted one picks up where it stopped.

## Handling errors

```js
import { install, NetworkError, RuntimeError } from '@opys/runtime';

try {
  await install(source, { vars });
} catch (err) {
  if (err instanceof NetworkError) showRetry(err.url, err.status);
  else if (err instanceof RuntimeError) showError(err.code, err.message);
  else throw err;
}
```

Every failure has a `code`. Decide from the code, never from the message
text.

| `code`       | Means                               | Do                                   |
| ------------ | ----------------------------------- | ------------------------------------ |
| `network`    | A download failed, after retries.   | Offer to retry.                      |
| `integrity`  | A file does not match its hash.     | Report it. The pack needs a rebuild. |
| `extraction` | An archive could not be unpacked.   | Check disk space and permissions.    |
| `manifest`   | The bundle is unreadable or unsafe. | Report it to the pack author.        |
| `io`         | The file system refused something.  | Show the message.                    |
| `other`      | Anything else.                      | Show the message.                    |

An install cannot be cancelled from JavaScript yet.

## Doing the steps yourself

`launch` is the short way. The pieces are there when you need control:

| Function                 | Does                                     |
| ------------------------ | ---------------------------------------- |
| `install(source, o)`     | Installs. Starts nothing.                |
| `prepare(source, o)`     | Installs, and returns what to start.     |
| `buildLaunch(source, o)` | Returns what to start. Installs nothing. |
| `spawnLaunch(spec)`      | Starts it.                               |

"What to start" is `{ command, args, workdir, envs }`.

**Use case: capture the game's log.** `launch` hands the game your
terminal. To read its output instead, spawn it yourself:

```js
import { spawn } from 'node:child_process';
import { prepare } from '@opys/runtime';

const spec = await prepare(source, { vars });
const child = spawn(spec.command, spec.args, {
  cwd: spec.workdir,
  env: { ...process.env, ...spec.envs },
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

**Use case: a fast first launch with Forge.** Forge and NeoForge finish
installing during the first launch, which makes it slow. To do that behind
your own progress screen, run once with one extra argument. The game is not
started:

```js
import { install, buildLaunch, spawnLaunch } from '@opys/runtime';

await install(source, { vars });
const spec = await buildLaunch(source, { vars });

if (spec.args.some((arg) => arg.startsWith('-Dhorno.'))) {
  const child = spawnLaunch({
    ...spec,
    args: ['-Dhorno.installOnly=true', ...spec.args],
  });
  await new Promise((done) => child.on('exit', done));
}
```

## Options

| Option            | Where               | Means                                             |
| ----------------- | ------------------- | ------------------------------------------------- |
| `vars`            | everywhere          | Values for the bundle's variables.                |
| `features`        | everywhere          | Switches such as `java_console`.                  |
| `platform`        | everywhere          | Install for another OS or CPU. Default: this one. |
| `cwd`             | `launch`, `prepare` | Overrides the working directory.                  |
| `install`         | `launch`, `prepare` | Install options, or `false` to skip installing.   |
| `onProgress`      | `install`           | The progress callback.                            |
| `concurrency`     | `install`           | Parallel downloads. Default 8.                    |
| `verifyIntegrity` | `install`           | `false` skips hash checks. Leave it on.           |
