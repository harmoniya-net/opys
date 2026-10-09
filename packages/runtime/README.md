# @opys/runtime

[![npm](https://img.shields.io/npm/v/@opys/runtime.svg)](https://www.npmjs.com/package/@opys/runtime)

The part of opys a launcher needs. It takes a bundle, installs what the bundle
lists, and starts the game. It builds nothing, and of opys it needs only
`@opys/core`, so it stays small.

```sh
npm install @opys/runtime
```

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

- The pack comes from `{ url }`, `{ bundle }` (a file on disk) or
  `{ manifest }` (in memory, with no carried files).
- `install` only installs. `launch` installs and starts the game. `prepare`
  installs and tells you what to start, for when you want to spawn it yourself.
- Everything that belongs to the player's machine, such as `root`, is passed
  as `vars`.
- A failure is a `RuntimeError` with a `code`: `network`, `integrity`,
  `extraction`, `manifest`, `io` or `other`. Decide from the code, not from
  the message.

Needs Node.js 20 or newer.

## Documentation

- [Launcher integration](https://harmoniya-net.github.io/opys/basics/launcher)
- [Variables](https://harmoniya-net.github.io/opys/plugins/minecraft#variables)

Part of [opys](https://github.com/harmoniya-net/opys).
