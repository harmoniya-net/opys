# @opys/runtime

[![npm](https://img.shields.io/npm/v/@opys/runtime.svg)](https://www.npmjs.com/package/@opys/runtime)

Installs an opys manifest and starts its game, for a launcher you write yourself. It downloads and verifies what the manifest lists, extracts archives, and spawns the process the manifest describes. Backed by the `opys-runtime` Rust crate via napi-rs.

```sh
npm install @opys/runtime
```

It needs Node.js 20 or newer. It depends on `@opys/core` for types only, and on its own binding.

```js
import { launch, RuntimeError } from '@opys/runtime';

try {
  const child = await launch(
    { bundle: '/home/player/packs/my-pack.opys' },
    {
      vars: {
        root: '/home/player/.local/share/my-pack',
        username: 'Player',
        uuid: '00000000-0000-0000-0000-000000000001',
        token: '0',
      },
      install: {
        onProgress(p) {
          if (p.phase === 'download') {
            process.stderr.write(`\r${p.fetched}/${p.total} files`);
          }
        },
      },
    },
  );
  child.on('exit', (code) => console.log(`the game exited with code ${code}`));
} catch (err) {
  if (err instanceof RuntimeError) console.error(`${err.code}: ${err.message}`);
  else throw err;
}
```

- The first argument of `install`, `prepare`, `buildLaunch` and `launch` is a source: `{ bundle }` (an absolute path on disk), `{ url }` (a bundle, downloaded whole first) or `{ manifest, blobs }` (in memory).
- `install` only installs. `launch` is `prepare` (install, then return the `LaunchSpec`) followed by `spawnLaunch`. `buildLaunch` returns the spec and installs nothing.
- Values that belong to the machine, such as `root`, are passed as `vars`. Pass `install: false` to `launch` or `prepare` to skip the install.
- Every failure is a `RuntimeError` with a `code`: `network`, `integrity`, `extraction`, `manifest`, `io`, `cancelled` or `other`. Branch on the code or the class, never on the message.

## Documentation

- [@opys/runtime](https://harmoniya-net.github.io/opys/plugins/runtime): every export, option, progress event and error.
- [Install and launch](https://harmoniya-net.github.io/opys/launcher/embedding): sources, options and a complete launcher.
