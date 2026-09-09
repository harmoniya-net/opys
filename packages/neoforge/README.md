# @opys/neoforge

[![npm](https://img.shields.io/npm/v/@opys/neoforge.svg)](https://www.npmjs.com/package/@opys/neoforge)

The NeoForge mod loader — every build, through one code path.

NeoForge installs by running its installer's processors on the machine that
runs it. None of that happens at build time. Every build is published ahead of
time as an ordinary Mojang `inheritsFrom` document, so resolving one is: read
the index, read the document, fold it onto the vanilla version it names — the
same thing `@opys/forge` and `@opys/fabric` do.

Resolution and mapping live in the `opys-neoforge` crate and reach JS through
`@opys/neoforge-binding`; this package is the typed surface over it, plus the
`neoforge()` plugin closure the build engine calls.

```sh
npm install @opys/neoforge
```

```js
import { defineConfig } from '@opys/dev';
import { neoforge } from '@opys/neoforge';
import { java } from '@opys/java';

export default defineConfig({
  output: 'opys.json',
  plugins: [neoforge('1.21.1'), java('21')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ neoforge }) => [
      neoforge.jvmArgs,
      neoforge.mainClass,
      neoforge.gameArgs,
    ],
    workdir: '${game_directory}',
  },
});
```

`version` accepts a Minecraft version (`1.21.1`, meaning its `best` build), an
alias (`1.21.1-latest` / `1.21.1-recommended` / `1.21.1-best`), or a bare
NeoForge build id (`21.1.172`). NeoForge runs no promotions endpoint, so the
index decides: `latest` is the newest build, `recommended` the newest one whose
version carries no qualifier, and `best` is `recommended` when there is one.

Builds launch through
[ForgeWrapper](https://github.com/harmoniya-net/ForgeWrapper), which the
document declares as one of its libraries and points at the installer — there
is nothing to configure and nothing for a launcher to know.

## Options

- `source` — document index base URL. Default: `DEFAULT_NEOFORGE_INDEX`
  (`https://harmoniya-net.github.io/ForgeWrapper/neoforge`).
- `manifestBase` — the Mojang version manifest, when it is not Mojang's own —
  a mirror, or a stand-in server under test.

`resolveNeoForge(options)` returns the template directly — artifacts, vars, the
per-OS `classpath` arms, and the decomposed `jvmArgs` / `mainClass` /
`gameArgs` — for composing with other plugins.
`resolveNeoForgeVersion(input, source?)` resolves just the build
(`{ minecraft, neoforge, documentUrl }`).

## A build id names no Minecraft version

`21.1.172` does mean Minecraft 1.21.1, and for years every NeoForge version
did — which is exactly why deriving it looked safe. `26.2.0.84` carries four
components and targets Minecraft `26.2`, which has no leading `1.` at all.

So nothing here parses a version. The generator reads `inheritsFrom` out of the
installer's own version JSON, and a build id is looked up in the index rather
than decomposed. That is also why `nfVersionToMc`, which earlier versions of
this package exported, is gone: it was a regex over a convention that has since
changed.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
