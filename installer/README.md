# @unifest/installer

Programmatic install and launch for [Unifest](../core/README.md) manifests.

## Install

```sh
bun add @unifest/installer @unifest/core
```

## Usage

Both `install` and `launch` accept a **manifest source** as their first argument:

| Source          | Example                                    |
| --------------- | ------------------------------------------ |
| File path       | `'unifest.json'`                           |
| HTTPS URL       | `new URL('https://example.com/pack.json')` |
| Parsed manifest | `Unifest` instance from `@unifest/core`    |

---

### `install(source, options?)`

Downloads missing artifacts in parallel to a staging directory, then moves them
to their final paths. Artifacts with an `extract` rule are unpacked afterward.
Already-cached artifacts whose hash matches are skipped.

```ts
import { install } from '@unifest/installer';

// from a file path
await install('unifest.json', {
  vars: { root: '/opt/minecraft/1.20.1' },
  concurrency: 64,
  onProgress(fetched, total) {
    process.stderr.write(`  ${fetched}/${total}\r`);
  },
});

// from a URL
await install(new URL('https://example.com/pack.json'));
```

**Options**

| Option        | Type                       | Default       | Description                             |
| ------------- | -------------------------- | ------------- | --------------------------------------- |
| `platform`    | `SatisfiesOsOptions`       | auto-detected | Override OS/arch detection              |
| `vars`        | `Record<string, string>`   | `{}`          | Extra vars (override manifest vars)     |
| `concurrency` | `number`                   | `32`          | Max parallel downloads                  |
| `onProgress`  | `(fetched, total) => void` | —             | Called every 50 files and at completion |

---

### `launch(source, options?)`

Runs `install` then spawns the process described by the manifest's launch
config. Returns the raw `ChildProcess` — the caller decides how to wait on it.

Pass `install: false` to skip installation (e.g. when you know everything is
already on disk).

```ts
import { launch } from '@unifest/installer';

const child = await launch('unifest.json', {
  vars: { username: 'Player', uuid: '<uuid>', token: '<access-token>' },
  install: { onProgress: (n, t) => console.log(`${n}/${t}`) },
});

await new Promise<void>((resolve, reject) => {
  child.on('exit', (code) =>
    code === 0 || code === null ? resolve() : reject(new Error(`exit ${code}`)),
  );
  child.on('error', reject);
});
```

**Options**

| Option     | Type                      | Default       | Description                            |
| ---------- | ------------------------- | ------------- | -------------------------------------- |
| `platform` | `SatisfiesOsOptions`      | auto-detected | Override OS/arch detection             |
| `vars`     | `Record<string, string>`  | `{}`          | Extra vars, typically auth credentials |
| `install`  | `InstallOptions \| false` | `{}`          | Install options, or `false` to skip    |

---

### `resolveManifest(source)`

Resolves a manifest source to a `Unifest` instance. Useful if you need the
parsed manifest before passing it to other APIs.

```ts
import { resolveManifest } from '@unifest/installer';

const manifest = await resolveManifest('unifest.json');
console.log(manifest.unifacts.length);
```

---

### `currentPlatform()`

Returns the `SatisfiesOsOptions` for the current host. Useful if you need to
pass `platform` manually or inspect what would be detected.
