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
  output: 'game.opys',
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

Wherever a build needs something done on the launching machine — running the
installer's processors from 1.13 on, rewriting the client jar before 1.6 — it
launches through [horno](https://github.com/harmoniya-net/horno), which the
document declares as one of its libraries. There is nothing to configure and
nothing for a launcher to know.

## Which Java

`java('8')` up to 1.16.5, `'17'` from 1.17, `'21'` from 1.20.5, `'25'` for
26.x. Every Minecraft version Forge publishes for has been launched that way
(`scripts/launch-matrix`), with these exceptions, none of them opys's:

- **1.7.2** predates Java 8 and dies in LaunchWrapper on it. It runs on Java
  7: `java('7', { vendor: 'zulu' })`.
- **1.16.4** reads a JDK internal that Java 8u321 changed, in its recommended
  build and its latest alike. Pin the last update before that:
  `java('8u312-b07')`.
- **1.5 and 1.5.1** do not install: FML wants two files from a host that no
  longer exists. See horno's `TODO.md`.

## Options

- `source` — document index base URL. Default: `DEFAULT_FORGE_INDEX`
  (`https://harmoniya-net.github.io/metadata/forge`).
- `manifestBase` — the Mojang version manifest, when it is not Mojang's own —
  a mirror, or a stand-in server under test.

`resolveForge(options)` returns the template directly — artifacts, vars, the
per-OS `classpath` arms, and the decomposed `jvmArgs` / `mainClass` /
`gameArgs` — for composing with other plugins.
`resolveForgeVersion(input, source?)` resolves just the build
(`{ minecraft, forge, documentUrl }`).

## A note on the classpath

A Forge document's libraries go **ahead** of the vanilla version's, and a
vanilla library Forge replaces drops out entirely rather than sitting behind
it. That is what `inheritsFrom` means; the client jar goes last, after every
library.

It is not bookkeeping. Forge 1.12.2 and 1.16.5 require log4j **2.15.0** where
those Minecraft versions ship 2.8.1 — the Log4Shell fix. Leaving 2.8.1 on
`-cp` behind it would download and mount a vulnerable jar for nothing.

The rules live in `inherited_classpath` / `superseded` in
`opys-minecraft-vanilla`, shared with every other loader rather than restated
here.

Part of the [opys](https://github.com/harmoniya-net/opys) toolkit;
re-exported by [`@opys/minecraft`](https://www.npmjs.com/package/@opys/minecraft).
