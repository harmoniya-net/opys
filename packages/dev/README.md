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
  output: 'opys.json',
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

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit.
