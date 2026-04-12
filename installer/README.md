# @unifest/installer

Programmatic install and launch for Unifest manifests. Downloads artifacts in parallel, verifies integrity, extracts natives, and spawns the JVM.

## Install

```sh
bun add @unifest/installer @unifest/core
```

## Manifest sources

Both `install` and `launch` accept a **manifest source** as their first argument:

| Value            | Example                                    |
| ---------------- | ------------------------------------------ |
| File path string | `'unifest.json'`                           |
| HTTPS URL object | `new URL('https://example.com/pack.json')` |
| Parsed `Unifest` | object returned by `resolveManifest`       |

---

## `install(source, options?)`

Downloads missing artifacts to a staging directory, moves them to final paths, and extracts zips for artifacts with `extract` rules. Already-cached artifacts whose hash matches are skipped. Failed integrity checks are retried up to 3 times before throwing.

```ts
import { install } from '@unifest/installer';

await install('unifest.json', {
  vars: {
    root: '/opt/minecraft/1.20.1',
    username: 'Player',
    uuid: '...',
    token: '...',
  },
  concurrency: 16,
  onProgress(p) {
    if (p.phase === 'download') {
      process.stderr.write(`  ${p.fetched}/${p.total}\r`);
    }
  },
});
```

**Options**

| Option            | Type                           | Default | Description                        |
| ----------------- | ------------------------------ | ------- | ---------------------------------- |
| `platform`        | `OsOptions`                    | auto    | Override OS/arch detection         |
| `vars`            | `Record<string, string>`       | `{}`    | Extra vars; override manifest vars |
| `concurrency`     | `number`                       | `8`     | Max parallel downloads             |
| `onProgress`      | `(p: InstallProgress) => void` | —       | Progress callback                  |
| `verifyIntegrity` | `boolean`                      | `true`  | Skip hash checks if `false`        |

**`InstallProgress`**

```ts
type InstallProgress =
  | { phase: 'resolve' }
  | { phase: 'download'; fetched: number; total: number; skipped: number }
  | { phase: 'verify' }
  | { phase: 'extract'; count: number };
```

---

## `launch(source, options?)`

Runs `install` then spawns the process described by the manifest's launch config. Returns a `ChildProcess` — the caller decides how to wait on it.

Pass `install: false` to skip installation.

```ts
import { launch } from '@unifest/installer';

const child = await launch('unifest.json', {
  vars: {
    root: '/opt/minecraft/1.20.1',
    username: 'Player',
    uuid: '...',
    token: '...',
  },
  install: { onProgress: (p) => console.log(p) },
});

await new Promise<void>((resolve, reject) => {
  child.on('exit', (code) =>
    code === 0 || code === null ? resolve() : reject(new Error(`exit ${code}`)),
  );
  child.on('error', reject);
});
```

**Options**

| Option     | Type                      | Default | Description                            |
| ---------- | ------------------------- | ------- | -------------------------------------- |
| `platform` | `OsOptions`               | auto    | Override OS/arch detection             |
| `vars`     | `Record<string, string>`  | `{}`    | Extra vars; typically auth credentials |
| `install`  | `InstallOptions \| false` | `{}`    | Install options, or `false` to skip    |
| `log`      | `(level, msg) => void`    | —       | Debug/warn logger for spawn details    |

---

## `resolveManifest(source)`

Resolves any manifest source to a `Unifest` object.

```ts
import { resolveManifest } from '@unifest/installer';

const manifest = await resolveManifest('unifest.json');
console.log(manifest.unifacts.length);
```

---

## `currentPlatform()`

Returns the `OsOptions` for the current host.

```ts
import { currentPlatform } from '@unifest/installer';

const platform = currentPlatform();
// { name: 'linux', arch: 'x64', version: '...' }
```

---

## Error types

| Class             | When                                 |
| ----------------- | ------------------------------------ |
| `NetworkError`    | HTTP download failure                |
| `IntegrityError`  | Hash mismatch after 3 retry attempts |
| `ExtractionError` | ZIP extraction failure               |
