# @opys/forge

[![npm](https://img.shields.io/npm/v/@opys/forge.svg)](https://www.npmjs.com/package/@opys/forge)

The Forge mod loader — **every version**, from the 1.1 jar mods to the current
processor installs, through one code path.

Forge installs four different ways depending on the build: run an installer's
processors, hand off to a LaunchWrapper tweaker, or overlay a zip of class
files onto the signed client jar. None of that happens here. Every build is
published ahead of time as an ordinary Mojang `inheritsFrom` document, so
resolving one is: read the index, read the document, fold it onto the vanilla
version it names — the same thing `@opys/fabric` does.

Resolution and mapping live in the `opys-forge` crate and reach JS through
`@opys/forge-binding`; this package is the typed surface over it, plus the
`forge()` plugin closure the build engine calls.

```sh
npm install @opys/forge
```

```js
import { defineConfig } from '@opys/dev';
import { forge } from '@opys/forge';
import { java } from '@opys/java';

export default defineConfig({
  output: 'opys.json',
  plugins: [forge('1.20.1'), java('17')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ forge }) => [forge.jvmArgs, forge.mainClass, forge.gameArgs],
    workdir: '${game_directory}',
  },
});
```

`version` accepts a Minecraft version (`1.20.1`, meaning its `best` build), an
alias (`1.20.1-latest` / `1.20.1-recommended` / `1.20.1-best`), or a full Forge
build id (`1.20.1-47.4.10`). `best` is Forge's `recommended` promotion when
there is one and `latest` otherwise.

Pre-1.13 builds launch through
[ForgeWrapper](https://github.com/harmoniya-net/ForgeWrapper), which the
document declares as one of its libraries — there is nothing to configure and
nothing for a launcher to know.

## Options

- `source` — document index base URL. Default: `DEFAULT_FORGE_INDEX`
  (`https://harmoniya-net.github.io/ForgeWrapper`).
- `manifestBase` — the Mojang version manifest, when it is not Mojang's own —
  a mirror, or a stand-in server under test.

`resolveForge(options)` returns the template directly — artifacts, vars, the
per-OS `classpath` arms, and the decomposed `jvmArgs` / `mainClass` /
`gameArgs` — for composing with other plugins.
`resolveForgeVersion(input, source?)` resolves just the build
(`{ minecraft, forge, documentUrl }`).

## A note on the classpath

A Forge document's libraries go **ahead** of the vanilla version's. That is
what `inheritsFrom` means, and order is the only thing that decides which of
two copies of a class the JVM loads — Forge ships its own ASM build where
vanilla ships another. The rule is `inherited_classpath` in
`opys-minecraft-vanilla`, shared with every other loader rather than restated
here.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
