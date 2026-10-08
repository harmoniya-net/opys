# Install and launch

This page is for a launcher you write on top of `@opys/runtime`: an Electron
app, a Tauri app with a Node process behind it, or a plain Node script. It
covers installing a manifest, starting the game, and every option the
functions take.

The runtime builds nothing. It takes a finished manifest, downloads and
verifies what it lists, and starts the game the manifest describes. The
manifest comes from a bundle, the single file `opys build` writes, or from
memory. Values that belong to the launching machine, such as the game
directory and the player's account, are passed by you. See
[Variables](/launcher/vars).

## Install the package

```sh
npm install @opys/runtime
```

This needs Node.js 20 or newer. The package depends on `@opys/core`, which it
uses for types only, and on its own native binding, `@opys/runtime-binding`.
npm installs both. Nothing from `@opys/dev`, `@opys/minecraft` or a loader
package is loaded at run time. Install `@opys/core` yourself only if you want
its `Manifest` and `Blobs` types in TypeScript.

## Manifest sources

`install`, `prepare`, `buildLaunch` and `launch` take a **source** as their
first argument. It is one of three shapes, told apart by which field is
present.

| Shape                 | Field                | Meaning                                                                                                     |
| --------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `{ bundle }`          | `bundle: string`     | A bundle on disk. A relative path is relative to the launcher's working directory, so pass an absolute one. |
| `{ url }`             | `url: string`        | An `http` or `https` URL of a bundle, downloaded whole first.                                               |
| `{ manifest, blobs }` | `manifest: Manifest` | A manifest object in memory.                                                                                |
|                       | `blobs?: Blobs`      | Where each blob the manifest names is kept. Empty when left out.                                            |

### A bundle on disk

```js
const source = { bundle: '/home/player/packs/my-pack.opys' };
```

A bundle is a zip file. `buildLaunch`, and `prepare` or `launch` with
`install: false`, read only its head. An install reads the artifact list as
well.

### A bundle at a URL

```js
const source = { url: 'https://example.com/packs/my-pack.opys' };
```

The whole bundle is downloaded to a temporary file before the install starts.
The file is removed when the install ends. No progress events are sent while
the bundle downloads. `buildLaunch` downloads the whole bundle as well; only
a bundle on disk has just its head read.

A request that cannot connect, times out, or gets status 408, 425, 429, 500,
502, 503 or 504 is tried again, up to four attempts in all, with short pauses
that grow. Any other status, such as 404, and a transfer that breaks off part
way, fail at once with a `NetworkError`. Only `http` and `https` URLs work.

### A manifest in memory

```js
const source = {
  manifest: { vars, artifacts, launch },
  blobs: { [id]: { bytes: base64 } },
};
```

`manifest` is the JavaScript form of a manifest, the `Manifest` type from
`@opys/core`: `vars` and `artifacts`, and optionally `launch` and `restrict`.
An artifact's `source` is `{ url }` or `{ blob: id }`, where `id` is the
lowercase hex sha256 of the bytes.

Each entry of `blobs` is one of:

| Shape            | Meaning                                       |
| ---------------- | --------------------------------------------- |
| `{ file: path }` | A file on this machine, read at install time. |
| `{ bytes: b64 }` | The bytes, base64-encoded.                    |

Every blob id the manifest names must be a key of `blobs`. A missing one is
refused before anything downloads, with code `manifest`. This script runs as
written:

```js
import { createHash } from 'node:crypto';
import { install } from '@opys/runtime';

const bytes = Buffer.from('hello from a blob\n');
const id = createHash('sha256').update(bytes).digest('hex');

await install({
  manifest: {
    vars: { root: '/home/player/my-pack' },
    artifacts: [{ path: '${root}/hello.txt', source: { blob: id } }],
  },
  blobs: { [id]: { bytes: bytes.toString('base64') } },
});
```

Use the in-memory form for a manifest that was just built and never written to
a bundle. A launcher that receives a published pack uses `{ bundle }` or `{ url }`.

## Install

`install(source, options?)` downloads the artifacts that are not already on
disk, verifies them, extracts the archives, and then removes files that match
the manifest's `restrict` patterns but that the manifest does not list, along
with empty directories beneath them. It resolves when all of that is done.

```js
import { install } from '@opys/runtime';

await install(
  { bundle: '/home/player/packs/my-pack.opys' },
  {
    vars: { root: '/home/player/.local/share/my-pack' },
  },
);
```

A file already on disk is hashed, and downloaded again only if the hash does
not match. An artifact with no hash is kept as it is. Archives are unpacked on
every install, including those that were not downloaded this time. A file that
fails its check after a download throws `IntegrityError`.

A download is tried four times, waiting 0.5 s, 2 s and 8 s between attempts,
before it fails with a `NetworkError`. A blob copied out of a bundle is not
retried.

## Launch

`launch(source, options?)` installs, then starts the game. It resolves with a
Node `ChildProcess`, and the child inherits this process's standard streams.

```js
import { launch } from '@opys/runtime';

const child = await launch(
  { bundle },
  {
    vars: { root, username, uuid, token },
  },
);
child.on('exit', (code) => console.log('exited with', code));
```

`prepare(source, options?)` installs and resolves with a `LaunchSpec` instead
of starting the game. `buildLaunch(source, options?)` resolves with the same
`LaunchSpec` and installs nothing. `spawnLaunch(spec)` starts a spec with the
standard streams inherited.

```ts
type LaunchSpec = {
  command: string;
  args: string[];
  workdir: string;
  envs: Record<string, string>;
};
```

To choose the streams yourself, start the process from the spec:

```js
import { spawn } from 'node:child_process';

const child = spawn(spec.command, spec.args, {
  cwd: spec.workdir,
  env: { ...process.env, ...spec.envs },
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

The working directory is the manifest's `launch.workdir` after variables are
applied, unless the `cwd` option overrides it. A relative one is relative to
the launcher's own working directory, and a manifest whose author left
`workdir` out has `.`. If the manifest's `workdir` is not what you want, pass
`cwd`; it takes variables too, as in `cwd: '${game_directory}'`.

## Options

Every option is optional.

### `install`

| Option            | Type                           | Default   | Meaning                                                                                                               |
| ----------------- | ------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------- |
| `platform`        | `OsOptions`                    | this host | The OS and CPU that rules are matched against.                                                                        |
| `vars`            | `Record<string, string>`       | `{}`      | Values for `${name}`. They override the manifest's vars of the same name.                                             |
| `features`        | `string[]`                     | `[]`      | Feature names that rules can require or forbid.                                                                       |
| `concurrency`     | `number`                       | `8`       | The download budget. See below.                                                                                       |
| `verifyIntegrity` | `boolean`                      | `true`    | `false` skips the check after downloads. Files already present are still hashed, since that decides what to download. |
| `onProgress`      | `(p: InstallProgress) => void` | none      | Called as each phase moves. See [Progress](/launcher/progress).                                                       |

### `launch`, `prepare` and `buildLaunch`

| Option     | Type                      | Default          | Meaning                                                                                                                 |
| ---------- | ------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `platform` | `OsOptions`               | this host        | As for `install`.                                                                                                       |
| `vars`     | `Record<string, string>`  | `{}`             | As for `install`. Also applied to the command, arguments and environment.                                               |
| `features` | `string[]`                | `[]`             | As for `install`.                                                                                                       |
| `cwd`      | `string`                  | `launch.workdir` | Overrides the working directory. Variables are applied to it.                                                           |
| `install`  | `InstallOptions \| false` | `{}`             | Options for the install. `false` skips it, so `launch` only starts the game and `prepare` does what `buildLaunch` does. |

`prepare` and `launch` use their top-level `platform`, `features` and `vars` for
the install too. The `install` object contributes only `concurrency`,
`verifyIntegrity` and `onProgress`; a `platform`, `vars` or `features` inside
it is ignored. `buildLaunch` takes the same options as `launch`, without
`install`.

`concurrency` is a budget, not a count of connections. Each download or blob
copy takes a share of it by the size the manifest declares: 1 for a file under
1 MiB or of unknown size, 2 under 10 MiB, 4 under 50 MiB and 8 above that. At
the default of 8, eight small files run together and a file of 50 MiB or more
runs alone. Larger files start first.

### `currentPlatform()`

Returns the `OsOptions` of this host:

```js
currentPlatform();
// { name: 'linux', version: '', arch: 'x86_64' }
```

`name` is `linux`, `windows` or `osx`. `arch` is `x86_64` or `aarch64`, and
`version` is empty. Pass another value as `platform` to prepare for another
machine.

## Loader install steps

Some loaders need work that only the launching machine can do. Forge and
NeoForge run processors that build a patched client jar. The manifest names
that work with `-Dhorno.*` properties, and horno does it. horno runs as part of
the game's own command line, on the way into the game, so starting the
manifest's command is the whole step. It does the work once: it leaves a
receipt beside the installer, and later launches see the receipt and go
straight to the game.

To do the step before the game starts, run the launch once with
`-Dhorno.installOnly=true` in front of its arguments. This is what `opys install`
does, when the manifest's arguments name `-Dhorno.`. Install the source first,
since `buildLaunch` installs nothing:

```js
import { install, buildLaunch, spawnLaunch } from '@opys/runtime';

await install(source, { vars, features });
const spec = await buildLaunch(source, { vars, features });
const child = spawnLaunch({
  ...spec,
  args: ['-Dhorno.installOnly=true', ...spec.args],
});
await new Promise((done, fail) => {
  child.on('exit', (code) =>
    code === 0 ? done() : fail(new Error(`exit ${code}`)),
  );
});
```

## Cancellation

Cancellation is not supported from JavaScript. The Rust crate under the runtime
can cancel an install and reports a `cancelled` error, but `install`, `launch`
and `prepare` take no signal and pass no token. An install runs to the end or
to a failure. Ending the launcher's process is the only way to stop it.

## Errors

A failure the runtime names is a `RuntimeError` with a `code`. Branch on the
code, not the message.

| Class             | `code`       | When                                                                          |
| ----------------- | ------------ | ----------------------------------------------------------------------------- |
| `NetworkError`    | `network`    | A download was refused. Carries `url`, `status`, `body`.                      |
| `IntegrityError`  | `integrity`  | A file is not the one the manifest pins. Carries `paths`.                     |
| `ExtractionError` | `extraction` | An archive could not be unpacked. Carries `artifactPath`.                     |
| `RuntimeError`    | `manifest`   | The manifest or its bundle could not be read, or a blob is missing.           |
| `RuntimeError`    | `io`         | The file system refused something, such as a bundle path that does not exist. |
| `RuntimeError`    | `other`      | Anything else, such as a circular variable reference.                         |

A source of the wrong shape, such as `{ bundle, url }`, is refused before the
runtime starts, as a plain `Error` and not a `RuntimeError`. See
[Errors](/launcher/errors) for the full list.

```js
import { install, RuntimeError, NetworkError } from '@opys/runtime';

try {
  await install({ url });
} catch (err) {
  if (err instanceof NetworkError) retryLater();
  else if (err instanceof RuntimeError) showError(err.code, err.message);
  else throw err;
}
```

## A complete launcher

This script takes a bundle path, installs it, and starts the game. It prints
download progress and the exit code. The values are placeholders: `root` is the
directory your launcher keeps the game in, and the account values come from
your own sign-in.

```js
// launcher.mjs
import { resolve } from 'node:path';
import { launch, RuntimeError } from '@opys/runtime';

const [bundle] = process.argv.slice(2);
if (!bundle) {
  console.error('usage: node launcher.mjs <bundle.opys>');
  process.exit(2);
}

const vars = {
  root: '/home/player/.local/share/my-pack',
  username: 'Player',
  uuid: '00000000-0000-0000-0000-000000000001',
  token: '0',
};

try {
  const child = await launch(
    { bundle: resolve(bundle) },
    {
      vars,
      install: {
        onProgress(p) {
          if (p.phase === 'download') {
            process.stderr.write(`\r${p.fetched}/${p.total} files`);
          }
        },
      },
    },
  );
  child.on('exit', (code) => {
    console.log(`\nthe game exited with code ${code}`);
  });
} catch (err) {
  if (err instanceof RuntimeError) {
    console.error(`${err.code}: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
```

Run it as `node launcher.mjs my-pack.opys`. A token of `0` starts the game
without a Microsoft account, as [Getting started](/guide/getting-started)
describes.
