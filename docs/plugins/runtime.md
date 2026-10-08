# @opys/runtime

`@opys/runtime` installs a manifest and starts its game, for a launcher you
write yourself. This page lists every export with its signature. For how the
pieces fit together, read [Install and launch](/launcher/embedding); for the
events, see [Progress](/launcher/progress); for the error codes, see
[Errors](/launcher/errors).

The package depends on `@opys/core` alone among the opys packages, and uses it
for types only. It also depends on its own native binding,
`@opys/runtime-binding`, which npm installs with it. Its JavaScript imports are
`@opys/core`, its binding and `node:` modules. It has no third-party
dependency. It needs Node.js 20 or newer.

```ts
import {
  install,
  prepare,
  buildLaunch,
  launch,
  spawnLaunch,
  currentPlatform,
  RuntimeError,
  NetworkError,
  IntegrityError,
  ExtractionError,
  translateError,
} from '@opys/runtime';

import type {
  ManifestSource,
  InstallOptions,
  LaunchOptions,
  LaunchSpec,
  OsOptions,
  InstallProgress,
  RuntimeErrorCode,
  InstallError,
} from '@opys/runtime';
```

## Manifest sources

`install`, `prepare`, `buildLaunch` and `launch` take a `ManifestSource` first.
The shape is told apart by which field is present.

```ts
type ManifestSource =
  | { readonly bundle: string }
  | { readonly url: string }
  | { readonly manifest: Manifest; readonly blobs?: Blobs };
```

| Shape                 | What it is                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `{ bundle }`          | A [bundle](/reference/bundle-format) on disk, by path. A relative path is relative to the process's working directory. |
| `{ url }`             | An `http` or `https` URL of a bundle. It is fetched whole before anything is installed.                                |
| `{ manifest, blobs }` | A [manifest](/reference/manifest) in memory, and where each blob it names is kept.                                     |

`Manifest` and `Blobs` are the types from [`@opys/core`](/plugins/core).

## Functions

### `install`

```ts
function install(
  source: ManifestSource,
  options?: InstallOptions,
): Promise<void>;
```

Downloads the artifacts that are missing or wrong, verifies them, extracts the
archives and then removes stale files that the manifest's `restrict` patterns
cover. It starts nothing. Rejects with a `RuntimeError`, or one of its
subclasses, when a step fails.

### `prepare`

```ts
function prepare(
  source: ManifestSource,
  options?: LaunchOptions,
): Promise<LaunchSpec>;
```

Installs, then returns the `LaunchSpec` the manifest describes. It reads the
source once, so a bundle is opened, or downloaded, once for both steps. Pass
`install: false` in `options` to skip the install; `prepare` then does what
`buildLaunch` does. A manifest with no `launch` block is refused with code
`other` before anything is installed.

### `buildLaunch`

```ts
function buildLaunch(
  source: ManifestSource,
  options?: Omit<LaunchOptions, 'install'>,
): Promise<LaunchSpec>;
```

Returns the `LaunchSpec` and installs nothing. For a bundle on disk, only the
head is read. The artifact list is not. A `{ url }` bundle is still downloaded
whole.

### `launch`

```ts
function launch(
  source: ManifestSource,
  options?: LaunchOptions,
): Promise<ChildProcess>;
```

Runs `prepare`, then spawns the process with `spawnLaunch`. The caller decides
how to wait on the returned `ChildProcess` from `node:child_process`. A program
that cannot be started is reported as an `error` event on the child, not as a
rejection; see [Errors](/launcher/errors).

### `spawnLaunch`

```ts
function spawnLaunch(spec: LaunchSpec): ChildProcess;
```

Spawns what a `LaunchSpec` describes. The working directory is `spec.workdir`.
The environment is the current `process.env` with `spec.envs` added. Stdio is
inherited from this process.

### `currentPlatform`

```ts
const currentPlatform: () => OsOptions;
```

Returns the `OsOptions` of the machine the code runs on, as the runtime detects
it. It is the default for `platform` in `install`, `prepare`, `buildLaunch` and
`launch`.

### `translateError`

```ts
function translateError(err: unknown): unknown;
```

Turns the error the binding throws into the typed error from the
[Errors](#errors) section. The functions above call it already. Anything that
is not a runtime report, such as a bad argument refused before the install
started, comes back unchanged.

## Options

### `InstallOptions`

```ts
interface InstallOptions {
  platform?: OsOptions;
  vars?: Record<string, string>;
  concurrency?: number;
  verifyIntegrity?: boolean;
  features?: string[];
  onProgress?: (p: InstallProgress) => void;
}
```

| Option            | Default              | Meaning                                                                                                                                                                     |
| ----------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform`        | the current platform | The OS and architecture rules are matched against.                                                                                                                          |
| `vars`            | `{}`                 | Variables for this install. They take precedence over the manifest's `vars`.                                                                                                |
| `concurrency`     | `8`                  | The download budget. A file costs 1 under 1 MiB or of unknown size, 2 under 10 MiB, 4 under 50 MiB and 8 above, so at the default a file of 50 MiB or more downloads alone. |
| `verifyIntegrity` | `true`               | Set to `false` to skip the hash check after downloads. Files already on disk are still hashed to decide what to download.                                                   |
| `features`        | `[]`                 | Feature names that are on, for rule matching. See [mojang-rules](/plugins/mojang-rules).                                                                                    |
| `onProgress`      | none                 | Called with each `InstallProgress` event.                                                                                                                                   |

### `LaunchOptions`

```ts
interface LaunchOptions {
  platform?: OsOptions;
  features?: string[];
  vars?: Record<string, string>;
  cwd?: string;
  install?: InstallOptions | false;
}
```

| Option     | Default                  | Meaning                                                                         |
| ---------- | ------------------------ | ------------------------------------------------------------------------------- |
| `platform` | the current platform     | As in `InstallOptions`.                                                         |
| `features` | `[]`                     | As in `InstallOptions`.                                                         |
| `vars`     | `{}`                     | Variables for the launch. Set the machine's own paths here, for example `root`. |
| `cwd`      | the manifest's `workdir` | The directory the process starts in. Variables are applied to it.               |
| `install`  | `{}`                     | The options for the install step. `false` skips the install.                    |

`LaunchOptions.install` is typed as an `InstallOptions`, but `prepare` and
`launch` read only its `concurrency`, `verifyIntegrity` and `onProgress`. The
install step uses the launch's own `platform`, `vars` and `features`; the same
three inside `install` are ignored.

### `LaunchSpec`

```ts
interface LaunchSpec {
  command: string;
  args: string[];
  workdir: string;
  envs: Record<string, string>;
}
```

`OsOptions` is the platform record:

```ts
interface OsOptions {
  name: string;
  version: string;
  arch: string;
}
```

## Progress events

`onProgress` is called with one of these. The union is discriminated by
`phase`. For what each phase means and in which order they come, see
[Progress](/launcher/progress).

```ts
type InstallProgress =
  | { phase: 'resolve' }
  | {
      phase: 'download';
      fetched: number;
      total: number;
      skipped: number;
      bytes: number;
      totalBytes: number;
    }
  | { phase: 'download:start'; path: string; totalBytes: number }
  | { phase: 'download:bytes'; path: string; bytes: number }
  | { phase: 'download:done'; path: string }
  | { phase: 'verify' }
  | { phase: 'extract'; count: number }
  | { phase: 'sweep'; removed: number };
```

`totalBytes` on `download` is the sum of the sizes the manifest declares, so it
is short by whatever is listed without one. On `download:start` it is `0` for
a file the manifest gives no size. The `path` in the three `download:*` events
is the artifact's path as the manifest spells it, with variables not yet
filled in.

## Errors

Every failure the runtime names is a `RuntimeError` with a `code`. Branch on
the `code` or on the class, never on the message.

```ts
type RuntimeErrorCode =
  | 'network'
  | 'integrity'
  | 'extraction'
  | 'manifest'
  | 'io'
  | 'cancelled'
  | 'other';

type InstallError = NetworkError | IntegrityError | ExtractionError;
```

| `code`       | Class             | When                                                                            | Also carries            |
| ------------ | ----------------- | ------------------------------------------------------------------------------- | ----------------------- |
| `network`    | `NetworkError`    | A download was refused.                                                         | `url`, `status`, `body` |
| `integrity`  | `IntegrityError`  | A file just downloaded or copied is not the one the manifest pins.              | `paths`                 |
| `extraction` | `ExtractionError` | An archive could not be unpacked.                                               | `artifactPath`, `cause` |
| `manifest`   | `RuntimeError`    | The manifest or its bundle could not be read, or it names a blob nothing holds. |                         |
| `io`         | `RuntimeError`    | The file system refused something.                                              |                         |
| `cancelled`  | `RuntimeError`    | The install was cancelled. It is never produced from JavaScript today.          |                         |
| `other`      | `RuntimeError`    | Anything else, such as a circular variable reference.                           |                         |

The classes and their constructors:

```ts
class RuntimeError extends Error {
  constructor(code: RuntimeErrorCode, message: string, options?: ErrorOptions);
  readonly code: RuntimeErrorCode;
}

class NetworkError extends RuntimeError {
  constructor(url: string, status: number, message: string, body?: string);
  readonly url: string;
  readonly status: number;
  readonly body: string; // what the server said, or ''
}

class IntegrityError extends RuntimeError {
  constructor(paths: string[], message?: string);
  readonly paths: string[];
}

class ExtractionError extends RuntimeError {
  constructor(artifactPath: string, message?: string, options?: ErrorOptions);
  readonly artifactPath: string;
}
```

`ExtractionError` gets its `cause` from the runtime, as an `Error` whose
message is the underlying failure. What each field holds, and what a launcher
should do for each code, is on [Errors](/launcher/errors).

```ts
try {
  await install(source);
} catch (err) {
  if (err instanceof RuntimeError && err.code === 'network') retryLater();
  else throw err;
}
```
