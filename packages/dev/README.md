# @opys/dev

[![npm](https://img.shields.io/npm/v/@opys/dev.svg)](https://www.npmjs.com/package/@opys/dev)

The build SDK for opys: `defineConfig`, the build engine, the plugin contract, and the `files` and `userDataDir` helpers. Use it to write an `opys.config.mjs` or a plugin that feeds one. The example also uses `@opys/minecraft`.

```sh
npm install -D @opys/dev
```

```js
import { defineConfig, definePlugin } from '@opys/dev';
import { java, minecraft } from '@opys/minecraft';

const welcome = (motd) =>
  definePlugin({
    name: 'welcome',
    build(ctx) {
      ctx.log('welcome', `motd is "${motd}"`);
      return { vars: { motd }, launch: { jvmArg: '-Dwelcome.motd=${motd}' } };
    },
  });

export default defineConfig({
  output: 'game.opys',
  plugins: [minecraft('1.21.1'), java('21'), welcome('Hello from opys')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ welcome, minecraft }) => [
      welcome.jvmArg,
      minecraft.jvmArgs,
      minecraft.mainClass,
      minecraft.gameArgs,
    ],
    workdir: '${game_directory}',
  },
});
```

- A plugin is `{ name, build }`. Constructing it does no I/O. `build` runs only while building and returns a `Contribution`: `artifacts`, `blobs`, `vars`, `launch` groups and `envs`.
- `definePlugin` adds the chainable `exclude`, `addRule`, `removeIntegrity`, `updateFirst` and `updateMany`. Each returns a new plugin and changes `artifacts` only.
- `files({ from, to })` carries a local directory in the bundle. With a `url` the files are pointed at and pinned by hash instead. For a file that is already published, use `links` from `@opys/links`.
- `userDataDir(name)` belongs in `runClient`, never in `manifest.vars`: there it would bake the build machine's path into every bundle.

## Documentation

- [@opys/dev](https://harmoniya-net.github.io/opys/plugins/dev): every export, with its signature.
- [Writing a plugin](https://harmoniya-net.github.io/opys/reference/writing-a-plugin): a tutorial that builds one.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit.
