# @opys/runtime

[![npm](https://img.shields.io/npm/v/@opys/runtime.svg)](https://www.npmjs.com/package/@opys/runtime)

Programmatic install and launch for opys manifests. Downloads artifacts in
parallel, copies blobs out of the bundle, verifies integrity, extracts
archives, and spawns the process. Backed by the
[`opys-runtime`](https://crates.io/crates/opys-runtime) Rust crate via napi-rs.

```sh
npm install @opys/runtime @opys/core
```

## Manifest sources

`install`, `buildLaunch`, `prepare` and `launch` all take a **manifest
source** as their first argument — discriminated by which field is present:

| Source                | What it is                                                                   |
| --------------------- | ---------------------------------------------------------------------------- |
| `{ bundle: path }`    | A bundle on disk — the published form of a manifest                          |
| `{ url }`             | A bundle to download. It is fetched whole before anything is installed       |
| `{ manifest, blobs }` | A manifest in memory, and where each blob it names is kept (see `@opys/dev`) |

A bundle is a zip: the manifest's head, its artifact list, and one entry per
blob. See [`@opys/core`](https://www.npmjs.com/package/@opys/core).

---

## `install(source, options?)`

Streams missing artifacts to `<finalPath>.partial` then renames them into
place; extracts archives for artifacts with `extract` rules. A present file is
skipped only if it still matches its hash. A failed integrity check throws
`IntegrityError`.

```ts
import { install } from '@opys/runtime';

await install(
  { bundle: 'server.opys' },
  {
    vars: { root: '/srv/minecraft' },
    concurrency: 16,
    onProgress(p) {
      if (p.phase === 'download') {
        process.stderr.write(`  ${p.fetched}/${p.total}\r`);
      }
    },
  },
);
```

| Option            | Type                           | Default | Description                        |
| ----------------- | ------------------------------ | ------- | ---------------------------------- |
| `platform`        | `OsOptions`                    | auto    | Override OS/arch detection         |
| `vars`            | `Record<string, string>`       | `{}`    | Extra vars; override manifest vars |
| `features`        | `string[]`                     | `[]`    | Active features, for rule matching |
| `concurrency`     | `number`                       | `8`     | Max parallel downloads             |
| `onProgress`      | `(p: InstallProgress) => void` | —       | Progress callback                  |
| `verifyIntegrity` | `boolean`                      | `true`  | Skip hash checks if `false`        |

---

## `launch(source, options?)`

Runs `install`, then spawns the process the manifest's launch block describes.
Returns a `ChildProcess` — the caller decides how to wait on it. Pass
`install: false` to skip the install.

```ts
import { launch } from '@opys/runtime';

const child = await launch(
  { bundle: 'server.opys' },
  { vars: { root: '/srv/minecraft' } },
);
```

`prepare(source, options?)` is the same without the spawn: it installs and
returns the `LaunchSpec` — `{ command, args, workdir, envs }` — from one
reading of the source, so a bundle is opened, or downloaded, once for both.
`spawnLaunch(spec)` spawns one. `buildLaunch(source, options?)` returns the
spec and installs nothing; for a bundle on disk it reads the head and never
the artifact list.

---

## `currentPlatform()`

Returns the `OsOptions` for the current host.

## Errors

Every failure the runtime names is a `RuntimeError` with a `code`. Branch on
the code, not on the message — the wording is free to change.

| `code`       | Class             | When                                            | Also carries            |
| ------------ | ----------------- | ----------------------------------------------- | ----------------------- |
| `network`    | `NetworkError`    | A download was refused                          | `url`, `status`, `body` |
| `integrity`  | `IntegrityError`  | A file on disk is not the one the manifest pins | `paths`                 |
| `extraction` | `ExtractionError` | An archive could not be unpacked                | `artifactPath`, `cause` |
| `manifest`   | `RuntimeError`    | The manifest or its bundle is not readable      |                         |
| `io`         | `RuntimeError`    | The file system refused something               |                         |
| `cancelled`  | `RuntimeError`    | The install was cancelled                       |                         |
| `other`      | `RuntimeError`    | Anything else                                   |                         |

```ts
try {
  await install(source);
} catch (err) {
  if (err instanceof RuntimeError && err.code === 'network') retryLater();
  else throw err;
}
```
