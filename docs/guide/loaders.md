# Loaders

This page helps you choose a loader for a pack and write its version string. It
covers the six game plugins in `@opys/minecraft`: vanilla `minecraft`, `forge`,
`neoforge`, `fabric`, `cleanroom` and `lwjgl3ify`. For each one it lists what
the version string accepts, which launch groups you can put in `manifest.args`,
and the Java to pair it with.

The loader decides how the game starts: the main class, the JVM arguments that
come before it, and the libraries on the classpath. Choose it first, then build
`args` from the same plugin.

## At a glance

| Loader                            | Use it for                          | Minecraft versions                                       | Version string                                        | Java                            |
| --------------------------------- | ----------------------------------- | -------------------------------------------------------- | ----------------------------------------------------- | ------------------------------- |
| [`minecraft`](#minecraft-vanilla) | The game as Mojang ships it         | Any Mojang version id                                    | An exact id, or nothing for the latest release        | By version, see [below](#java)  |
| [`forge`](#forge)                 | Forge mods                          | Every Minecraft version in Forge's index, back to 1.1    | A Minecraft version, an alias, or a build id          | By version, with two exceptions |
| [`neoforge`](#neoforge)           | NeoForge mods                       | Every Minecraft version in NeoForge's index, from 1.20.2 | A Minecraft version, an alias, or a build id          | By version                      |
| [`fabric`](#fabric)               | Fabric mods                         | Any Minecraft version Fabric Meta has a loader for       | A Minecraft version; pin a loader build with `loader` | By version                      |
| [`cleanroom`](#cleanroom)         | Cleanroom, a 1.12.2 Forge successor | `1.12.2`                                                 | A Minecraft version, an alias, or a release tag       | 25                              |
| [`lwjgl3ify`](#lwjgl3ify)         | lwjgl3ify, Forge 1.7.10 on LWJGL 3  | `1.7.10`                                                 | A Minecraft version, an alias, or a release tag       | 25                              |

Cleanroom and lwjgl3ify exist to run an old Minecraft on a current Java, so
both take 25. The [Java section](#java) gives the rule for the rest.

## Version strings

Forge, NeoForge, Cleanroom and lwjgl3ify each publish an index of their
builds. Their version strings resolve in the same order:

1. An alias on a Minecraft version: `1.20.1-latest`, `1.20.1-recommended` or
   `1.20.1-best`.
2. A bare Minecraft version, which means its `best` build.
3. A full build id, such as `1.20.1-47.4.10`.

`best` is the `recommended` build when there is one, and `latest` otherwise.
What `recommended` means depends on the loader. For Forge it is Forge's own
promotion. For NeoForge it is the newest build whose id has no qualifier such
as `-beta`. For Cleanroom and lwjgl3ify it is the newest release that GitHub
does not mark as a prerelease.

Some Minecraft versions have no `recommended` build. A bare version still
resolves, to `latest`, but asking for the `-recommended` alias on one of them is
an error.

The index decides which Minecraft version a build belongs to, not the string.
Build ids are looked up rather than parsed, because nothing in them reliably
names the Minecraft version.

Fabric and vanilla are the exceptions. Their `version` is a Minecraft version
only, and they take no aliases.

## Launch groups

Every loader plugin contributes the same four groups under its own name. Use
them in `manifest.args` like this:

```js
args: ({ neoforge }) => [
  neoforge.jvmArgs,
  neoforge.mainClass,
  neoforge.gameArgs,
],
```

| Group              | Holds                                                     |
| ------------------ | --------------------------------------------------------- |
| `<name>.jvmArgs`   | The JVM arguments the loader needs, before the main class |
| `<name>.mainClass` | The main class to start                                   |
| `<name>.gameArgs`  | The arguments passed to the game                          |
| `<name>.command`   | The loader's launch command                               |

`<name>.command` is the text `${java_bin}`, the variable the `java` plugin sets,
so it is the same value as `java.bin`. The examples use `java.bin` and leave
`<name>.command` unused.

The groups are plain values, and the order of `args` is yours. Other arguments
can go between them.

## Minecraft (vanilla)

`minecraft` installs the game as Mojang publishes it, with no loader on top.
Use it to play vanilla, or as the base for a pack that adds mods by hand.

Its version string is an exact Mojang version id, such as `1.21.1` or `26.3`.
There are no aliases. Call it with no version to take the current release:

```js
minecraft(); // the latest stable release, resolved at build time
```

It exposes `minecraft.command`, `minecraft.jvmArgs`, `minecraft.mainClass` and
`minecraft.gameArgs`. Its one option besides the version is `manifestBase`, for
a Mojang mirror. The complete example:

<<< @/examples/vanilla/opys.config.mjs

The plugin is on [its own page](/plugins/minecraft).

## Forge

`forge` installs Forge for any version it publishes, from the 1.1 jar mods to
the current builds, through one code path.

Its version string accepts the three forms in
[Version strings](#version-strings). For example, `forge('1.20.1')` takes the
`best` build for 1.20.1, `forge('1.20.1-latest')` takes the newest one, and
`forge('1.20.1-47.4.10')` names one build exactly. A build id from the 1.7 era
is longer, such as `1.7.10-10.13.4.1614-1.7.10`, because it repeats the
Minecraft version at both ends.

It exposes `forge.command`, `forge.jvmArgs`, `forge.mainClass` and
`forge.gameArgs`. Its options are `source`, the document index, and
`manifestBase`. The configuration is the one shown in
[Getting started](/guide/getting-started#make-it-a-forge-pack), and the plugin is
on [its own page](/plugins/forge).

Forge pairs with Java by version, with two builds that need a pin. See the
[Java section](#java).

## NeoForge

`neoforge` installs NeoForge. Its index is published separately from Forge's,
and its build ids look nothing like Forge's.

Its version string accepts a Minecraft version, the three aliases and a
NeoForge build id such as `21.1.172`. A build with a qualifier, such as a
`-beta`, is never `recommended`, so a Minecraft version that has only such
builds resolves to its `latest` one. A build id names no Minecraft version, and
a recent one such as `26.2.0.84` belongs to Minecraft `26.2` with no leading
`1.`, so it is looked up rather than read.

It exposes `neoforge.command`, `neoforge.jvmArgs`, `neoforge.mainClass` and
`neoforge.gameArgs`. Its options are `source` and `manifestBase`, the same as
Forge's. The complete example:

<<< @/examples/loaders-neoforge/opys.config.mjs

The plugin is on [its own page](/plugins/neoforge).

## Fabric

`fabric` installs Fabric. Its `version` is always the Minecraft version, and a
Fabric loader build is chosen separately.

Without a `loader` option, `fabric` takes the newest stable loader build Fabric
Meta lists for that Minecraft version, or the newest build if none is marked
stable. Pin one with `loader` to stay on it:

```js
fabric('1.21.4', { loader: '0.16.10' }),
```

The pinned build must exist for that Minecraft version, or the build fails with
an HTTP error from Fabric Meta. Fabric takes no aliases, so `1.21.4-best` is not
a version string for it.

It exposes `fabric.command`, `fabric.jvmArgs`, `fabric.mainClass` and
`fabric.gameArgs`. Its options are `loader`, `source` (Fabric Meta, by default
`https://meta.fabricmc.net`) and `manifestBase`. The complete example:

<<< @/examples/loaders-fabric/opys.config.mjs

The plugin is on [its own page](/plugins/fabric).

## Cleanroom

`cleanroom` installs [Cleanroom](https://github.com/CleanroomMC/Cleanroom), a
successor to Forge for 1.12.2 on a modern JVM. Its index has one Minecraft
version, `1.12.2`.

Its version string accepts `1.12.2`, the three aliases, and an exact release
tag such as `0.6.13-alpha`. A release tag names no Minecraft version, so it is
looked up in the index, as every build id is.

It exposes `cleanroom.command`, `cleanroom.jvmArgs`, `cleanroom.mainClass` and
`cleanroom.gameArgs`. Its one option besides the version is `source`. No
installer runs, at build time or at launch: the release publishes a complete
version document, and opys reads that.

Cleanroom needs JDK 25. See the [Java section](#java). The plugin is on
[its own page](/plugins/cleanroom).

## lwjgl3ify

`lwjgl3ify` installs [lwjgl3ify](https://github.com/GTNewHorizons/lwjgl3ify), a
1.7.10 Forge variant on LWJGL 3. Its index has one Minecraft version, `1.7.10`.

Its version string accepts `1.7.10`, the three aliases, and an exact release tag
such as `3.0.37`. As for Cleanroom, a tag is looked up in the index.

It exposes `lwjgl3ify.command`, `lwjgl3ify.jvmArgs`, `lwjgl3ify.mainClass` and
`lwjgl3ify.gameArgs`. Two things come with it that you did not ask for:

- **UniMixins** is added under `mods/`, because lwjgl3ify cannot load without
  it. Pass `unimixins: false` to leave it out, for a pack that brings its own
  mixin runtime. `unimixins` also takes `{ version, repo }` to pick a different
  release.
- **The lwjgl3ify mod jar** is added under `mods/` from its GitHub releases.

GitHub limits anonymous requests, so pass `token` if the build fails with a rate
limit. The other options are `source`, `repo` (the repository the mod jar comes
from) and `apiBase`. The plugin is on [its own page](/plugins/lwjgl3ify).

## Java

Pair the loader with `java(...)` from `@opys/minecraft`, and choose its version
by the Minecraft version:

| Minecraft version | Java |
| ----------------- | ---- |
| 1.0 up to 1.16.5  | 8    |
| 1.17 up to 1.20.4 | 17   |
| 1.20.5 and later  | 21   |
| 26.x              | 25   |

From 1.7.2 on, these are the Java majors in Mojang's own version metadata,
except for 1.17 and 1.17.1, which Mojang lists at 16 and which also run on 17.

Two Forge builds need a pin:

- Forge 1.7.2 predates Java 8. It runs on Java 7:
  `java('7', { vendor: 'zulu' })`.
- Forge 1.16.4 reads a JDK internal that Java 8u321 changed. It needs the last
  update before that: `java('8u312-b07')`.

Cleanroom and lwjgl3ify take 25 whatever their Minecraft version.

opys does not check the pairing. A Java the game cannot run on fails when the
game starts, not when you build. See [Java](/guide/java) for how the runtime is
provisioned and which vendors are available.
