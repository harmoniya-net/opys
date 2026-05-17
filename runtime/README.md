# @torba/installer

Programmatic install and launch for Torba manifests. Downloads artifacts in parallel, verifies integrity, extracts natives, and spawns the JVM.

## Install

```sh
npm install @torba/installer @torba/core
```

## Manifest sources

Both `install` and `launch` accept a **manifest source** as their first argument:

| Value             | Example                                    |
| ----------------- | ------------------------------------------ |
| File path string  | `'torba.json'`                             |
| HTTPS URL object  | `new URL('https://example.com/pack.json')` |
| Parsed `Manifest` | object returned by `resolveManifest`       |

---

## `install(source, options?)`

Streams missing artifacts to `<finalPath>.partial` then renames them into place; extracts zips for artifacts with `extract` rules. Already-cached artifacts (path exists on disk) are skipped. A failed integrity check throws `IntegrityError` immediately.

```ts
import { install } from '@torba/installer';

await install('torba.json', {
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
import { launch } from '@torba/installer';

const child = await launch('torba.json', {
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

Resolves any manifest source to a `Manifest` object.

```ts
import { resolveManifest } from '@torba/installer';

const manifest = await resolveManifest('torba.json');
console.log(manifest.artifacts.length);
```

---

## `currentPlatform()`

Returns the `OsOptions` for the current host.

```ts
import { currentPlatform } from '@torba/installer';

const platform = currentPlatform();
// { name: 'linux', arch: 'x64', version: '...' }
```

---

## Error types

| Class             | When                               |
| ----------------- | ---------------------------------- |
| `NetworkError`    | HTTP download failure              |
| `IntegrityError`  | Hash mismatch on a downloaded file |
| `ExtractionError` | ZIP extraction failure             |
