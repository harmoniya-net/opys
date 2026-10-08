# @opys/dev

[![npm](https://img.shields.io/npm/v/@opys/dev.svg)](https://www.npmjs.com/package/@opys/dev)

Build SDK for opys: `defineConfig`, the build engine, the plugin
contract, artifact overrides, `files` for what is on your disk, and
`userDataDir`.

```sh
npm install @opys/dev @opys/core
```

```js
import { defineConfig } from '@opys/dev';
import { forge } from '@opys/forge';
import { java } from '@opys/java';

export default defineConfig({
  output: 'game.opys',
  plugins: [forge('1.20.1-best'), java('17')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ forge }) => [forge.jvmArgs, forge.mainClass, forge.gameArgs],
    workdir: '${game_directory}',
  },
});
```

### Plugin authors

A plugin is `{ name, build }`: pure to construct, with all network and
filesystem work inside `build`. `definePlugin` returns it with the fluent
post-processing methods (`exclude`, `addRule`, `updateMany`, …) attached.

```js
import { definePlugin } from '@opys/dev';

export function motd(text) {
  return definePlugin({
    name: 'motd',
    build(ctx) {
      ctx.log('motd', 'adding a var');
      return { vars: { motd: text } };
    },
  });
}
```

For a file that is already published — a GitHub release asset, a GitLab
package, a Modrinth or CurseForge file, a plain URL — use `links` from
[`@opys/link`](https://www.npmjs.com/package/@opys/link), which resolves it
to a pinned artifact. For a file on your disk, use `files`, below.

## Files that travel with the manifest

A plugin can contribute a file that has no URL — a private binary, a generated
config — as a **blob**. The artifact names the blob by the sha256 of its
bytes, and the contribution says where those bytes are on this machine:

```js
import { blobBytes, blobId, sourceBlob } from '@opys/core';
import { definePlugin } from '@opys/dev';

const motd = () =>
  definePlugin({
    name: 'motd',
    build() {
      const bytes = new TextEncoder().encode('motd = "hello"\n');
      const id = blobId(bytes);
      return {
        artifacts: [{ path: '${root}/motd.toml', source: sourceBlob(id) }],
        blobs: { [id]: blobBytes(bytes) },
      };
    },
  });
```

For a directory of local files, `files` does this for you:

```js
import { files } from '@opys/dev';

files({ from: 'server-files', to: '${root}/${rel}' });
```

`opys build` writes the blobs into the bundle; `opys launch` reads them from
where they are, with nothing copied in between. `to` is a template
(`${rel}`, `${dir}`, `${filename}`) or a function of the file, and defaults
to the file's relative path.

Give a `url` and the files are not carried at all: each artifact points at
the copy you publish there, pinned by its hash (`hash: 'sha1' | 'sha256'`).

```js
files({ from: 'mods', to: 'mods/${rel}', url: 'https://cdn.example/${rel}' });
```

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit.
