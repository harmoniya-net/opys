# @opys/dev

[![npm](https://img.shields.io/npm/v/@opys/dev.svg)](https://www.npmjs.com/package/@opys/dev)

Build SDK for opys: `defineConfig`, the build engine, the plugin
contract, artifact overrides, an artifact scanner, plus shared
fetchers (GitHub Releases today; GitLab and Maven next) used by every
loader plugin.

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

```js
import { definePlugin, gitHubReleaseArtifacts } from '@opys/dev';

export function myLoader(version) {
  return definePlugin({
    name: 'myloader',
    async build() {
      const { artifacts } = await gitHubReleaseArtifacts(
        'me/myloader',
        version,
        {
          assets: [
            {
              match: (a) => a.name.endsWith('.jar'),
              path: '${mods_directory}/myloader.jar',
            },
          ],
        },
      );
      return { artifacts };
    },
  });
}
```

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

For a directory of local files, `artifactScanner` does this for you:

```js
artifactScanner({
  directory: 'server-files',
  source: 'blob',
  path: '${root}/${rel}',
});
```

`opys build` writes the blobs into the bundle; `opys launch` reads them from
where they are, with nothing copied in between. Without `source: 'blob'` the
scanner emits URL artifacts instead, for files you publish somewhere yourself.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit.
