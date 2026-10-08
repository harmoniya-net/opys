# horno

This page covers **horno**, the small Java program that starts every Forge or
NeoForge build whose version document names it. On the first launch it installs
the loader on the player's machine; on every launch it then hands off to the
game. You need this page if you are debugging a loader that will not install or
launch, if you are changing a loader crate, or if you want to know what a Forge
document asks the launching machine to do. A pack author does not need to
configure horno: the version document the loader plugin reads already names it.

## What it is

horno (ukr. _горно_, the hearth that heats metal before forging) is a Java 8
program that installs a loader and then hands off to the game. It is a fork of
[ForgeWrapper](https://github.com/ZekerZhayard/ForgeWrapper), by way of
PrismLauncher's copy. The source and releases are at
[harmoniya-net/horno](https://github.com/harmoniya-net/horno).

It is shipped as one jar, `net.harmoniya:horno:<tag>`, which is a release asset
of that repository. A version document lists it as an ordinary library and
names `net.harmoniya.horno.Main` as its `mainClass`. The jar is Java 8 bytecode,
with the Java 9+ half of its module code stored under `META-INF/versions/9`.

The live documents name horno 0.1.6 at the time of writing.

## Why it exists

Forge and NeoForge install in four different ways: processors, a LaunchWrapper
tweaker, a client-jar overlay, or a bare universal zip. opys does not want to
know which one a build uses, and neither does any launcher that reads a
document. So each document says "run horno" and horno does the install.

The reason the work cannot happen at build time is where it has to land:

- **1.13 and later.** The loader's installer ships processors. They take the
  vanilla client jar and the libraries as they sit on the launching machine and
  write a patched client jar into that machine's `libraries/` folder. `opys
build` cannot run them, because it does not have the player's installation.
- **1.5.2 and older.** The client jar itself is rewritten: its signature is
  removed, and for the oldest builds a universal zip is copied over it. That
  also happens on the launching machine.

Horno used to work differently: the installer was declared as a library, and
horno loaded its classes and called into them. That broke whenever an installer
changed a method's signature. Horno now reads the installer's
`install_profile.json` as data and runs the processor jars itself. The
processors are Forge's and NeoForge's own tools; horno owns the driver, not the
transformations.

## First launch and later launches

On a 1.13 or later build, the first launch does this:

1. Opens the installer jar as a zip and reads its install profile and the
   version JSON it points to. The installer is never put on the classpath.
   Horno applies that version JSON's own JVM line to the running JVM: its
   system properties, module path, `--add-exports` and `--add-opens`. The
   published document leaves those arguments out so they are not applied
   twice.
2. Puts the profile's tool libraries on disk. A library that is already present
   and hashes correctly is left alone. Otherwise horno unpacks it from the
   installer's own `maven/` tree if it is there, and downloads it if it is not.
3. Resolves the profile's data map. `[coord]` is a file under `libraries/`,
   `/data/x` is unpacked from the installer, and anything else is a literal.
4. Runs each client-side processor in a child class loader, substituting the
   profile's `{TOKEN}`s into its arguments, then checks each file it declared
   against the sha1 in the profile.
5. Writes the receipt (below).
6. Unless `horno.installOnly` is set, puts the libraries the processors produced
   ahead of the rest of the class path and hands off to the installer's own main
   class with the game's arguments.

Later launches skip work that is already done. Two things decide what:

- **Processors that declare outputs** are skipped when every declared file is
  present and hashes to its expected value. The receipt is not consulted.
- **Processors that declare no outputs** are skipped only when the **receipt**
  says the whole chain finished before, and every file those processors name by
  coordinate is still on disk. Half the processors declare nothing, the binary
  patcher among them, so this is the common case.

### The receipt

The receipt is a file beside the installer jar, named after it with
`.installed` appended. For `forge-1.20.1-47.4.10-installer.jar` that is
`forge-1.20.1-47.4.10-installer.jar.installed`. Its contents are the installer's
sha1.

Unless horno is about to trust the receipt, it removes it before the first
processor starts. It writes the receipt after the last processor returns. So a
launch that failed partway leaves no receipt, and the next launch runs the chain
again. Without the receipt, a chain that failed at its fourth step left the
first three steps' files on disk, and the next launch took the install for
finished. A receipt counts only for the installer whose sha1 it names, so a new
installer always starts clean. An install made before receipts existed has none,
and runs its undeclared processors once more.

Libraries are hash-checked on every launch, unless `horno.skipVerify` is set.

## Properties

A document names these as JVM arguments. The launcher passes them through with
the rest of the JVM line and does not read any of them.

| Property              | Meaning                                                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `horno.librariesDir`  | The `libraries` folder. When absent, horno finds the loader's own jar on the class path and walks up to a folder named `libraries`.                                                           |
| `horno.minecraft`     | The vanilla client jar. When absent, horno looks for `minecraft-<mc>-client.jar` under `libraries/com/mojang/minecraft/<mc>/`.                                                                |
| `horno.installer`     | Where the loader's installer belongs. When absent on a launch, horno works the path out from the game's `--fml.*` arguments. In a standalone install, its presence selects the processor era. |
| `horno.installerUrl`  | Where to fetch the installer if it is not there.                                                                                                                                              |
| `horno.installerSha1` | The sha1 the installer must have.                                                                                                                                                             |
| `horno.mainClass`     | Pre-1.13 only: the class to hand off to, such as `net.minecraft.launchwrapper.Launch`. Its presence selects the jar-mod era.                                                                  |
| `horno.patched`       | Pre-1.13 only: where the patched client jar is written.                                                                                                                                       |
| `horno.jarmod`        | Pre-1.13 only: archives to overlay, separated by the platform path separator, in order. Absent means strip the signature only.                                                                |
| `horno.jarmodUrl`     | The same list of URLs, separated by spaces.                                                                                                                                                   |
| `horno.jarmodSha1`    | The same list of sha1s, separated by spaces.                                                                                                                                                  |

The loader's document names `horno.installer`, `horno.installerUrl` and
`horno.installerSha1` together, so the installer is an input that horno fetches
and verifies itself. The overlay archives work the same way with the `jarmod`
trio. Neither is ever a library, and neither goes on `-cp`.

## Flags

Flags are `-Dhorno.<name>=true`.

| Flag                    | Meaning                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `horno.offline`         | Never open a connection. A file that is missing or has the wrong sha1 is an error naming the file and the expected hash. |
| `horno.installOnly`     | Do the install and exit with 0 instead of handing off to the game.                                                       |
| `horno.forceProcessors` | Do not trust what the processors already built. Run them again.                                                          |
| `horno.skipVerify`      | Do not hash files already on disk. Faster, at your own risk.                                                             |
| `horno.skipHashCheck`   | Deprecated synonym for `forceProcessors`. The name is misleading: the flag never skipped a hash check.                   |

`forgewrapper.skipHashCheck` is also read as a synonym for `forceProcessors`.

Offline does not mean "the file is on disk". The installer can unpack some of
its libraries from its own jar, and that is local work. So offline means the
file is on disk or inside the installer, and horno checks the whole list before
it starts any processor. Once that passes, nothing is left to fetch.

`horno.offline` and `horno.skipVerify` together are contradictory, and horno
prints a warning when both are set.

## Install only

There are two ways to install without launching.

**Through `opys install`.** When the manifest's own arguments name a `-Dhorno.`
property, `opys install` runs the launch once with `-Dhorno.installOnly=true`
placed first on the JVM line. horno installs, prints that it is not launching,
and exits. The flag is added to the command line that `opys` builds; it is never
written into the manifest. A build with no horno properties, such as a 1.6.1 to
1.12.2 Forge build, has nothing to run, and `opys install` says so and stops.

**Standalone.** horno can be run as an installer on its own:

```sh
java -jar horno.jar install --document <url|path> --root <dir>
```

This reads a version document from a URL or a file, applies the `horno.*`
properties it names to itself, and installs into `<dir>/libraries`. A property
already set on the command line wins over the document, because the person
running it is more current than the file.

The standalone install stops after the loader's half. It fetches the libraries
the document lists, which include the vanilla client jar, and runs the
processors or the jar patch. It does not fetch the vanilla version document, the
asset index or the assets. Every launcher already does that, and horno ends its
output by saying so. You still need Minecraft's own files in place before you
launch the game.

The standalone install works for every era, including the ones horno never
launches. A 1.6.1 to 1.12.2 build names only Forge's own LaunchWrapper, so there
is nothing for horno to do beyond fetching its libraries.

## Pre-1.13 builds (jar mod)

Two shapes of old build, both handled by rewriting the client jar once:

- **1.5.2** ships an installer whose profile says to strip the signature. Forge's
  classes are an ordinary library. The document names `horno.mainClass` and
  `horno.patched` and no overlay.
- **1.5.1 and older** ship a universal zip of loose class files, meant to be
  copied over `minecraft.jar`. The document also names `horno.jarmod` and its
  URL and sha1, as the 1.4.7 document does.

The patch takes the vanilla client jar and writes the patched jar. Entries from
the overlay win, the client's remaining entries fill in the rest, and
`META-INF` is dropped. Dropping it is required: the vanilla jar is signed, and a
signed jar whose contents no longer match its signature fails with a
`SecurityException`. The jar is rebuilt only when it is missing, or when the
vanilla jar or an overlay is newer than it.

Two details of this era are worth knowing about:

- **The game directory.** Before 1.6 Minecraft has no `--gameDir`. Unless
  `minecraft.applet.TargetDirectory` is set, the game writes saves, options and
  FML's `lib/` into the user's `.minecraft`. horno sets that property to the
  working directory, which every launcher already sets per instance. Set it by
  hand and horno uses your value.
- **The hand-off.** The patched jar must be found instead of the vanilla one, not
  as well as it. horno starts the game in a `URLClassLoader` with the patched jar
  first, then the rest of the class path. The vanilla jar that `horno.minecraft`
  names and horno's own jar are left out. A launcher may keep a second copy of the
  vanilla jar under another name, and horno cannot tell it from any other entry;
  it stays, behind the patched jar, which is a superset, so nothing resolves past
  it. The game's LaunchWrapper needs that loader type.

### FML's own files

FML 4.x and 5.x download a few jars into `<game dir>/lib` on first run, from
`files.minecraftforge.net/fmllibs`. That host has been gone for years, so
without help these builds stop with a message to try again. horno does the
following instead:

- It reads FML's list of library files out of the archive it is already
  opening (`CoreFMLLibraries`), places each file in `lib/`, and FML finds them
  without connecting anywhere. Eight of the nine files come from Maven.
- The ninth file was published only by Forge. horno fetches a different
  artifact that carries the same classes, and patches FML's embedded list so
  that FML validates the new file's sha1.
- FML 5 also wants a deobfuscation data file, named from the build's
  `fmlversion.properties`. horno serves the two versions that still exist from
  the metadata site's `fmllibs/` directory, checked against the sha1 the build
  asks for. See [Version documents](/internals/metadata).

None of this is in the document. The file names and hashes belong to Forge's
closed set of builds, and a document is for what varies.

## JDK internals

On Java 9 and later, horno reaches into the JDK for things the JDK does not
promise to keep. Each one exists for a particular build:

| What horno does                                                                                        | Why                                                          |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Applies the loader's module path, `--add-exports` and `--add-opens` to a JVM that has already started. | Every modular Forge and NeoForge needs it.                   |
| Settles the `http` and `https` URL handlers before any provider is asked.                              | Forge for Minecraft 1.20.2 fails its first launch otherwise. |
| Puts the libraries the processors produced first on the class path.                                    | Forge for Minecraft 26.1 needs them there.                   |

The Java 9+ code lives in `META-INF/versions/9`. Java 8 has no modules, so the
Java 8 version of the same code does nothing for modules and URL handlers, and
appends the produced libraries to the class path with `URLClassLoader.addURL`.

The last two of these fail soft: horno prints which version is affected and
carries on. So a JDK that moved one of the fields they use would show up as one
build crashing months later, with nothing pointing back at horno. To catch that,
`jdk-probe/run.sh <horno jar>` asks the JDK on `PATH` (or `JAVA_HOME`) the same
questions those builds ask, and whether `java.base/java.lang.invoke` can still be
opened after start. It exits non-zero on the first wrong answer. CI runs it
against the built jar on Java 17, 21, 25 and 27.

## Known limits

- **Ten Forge 1.5 betas cannot be installed.** Three different files were
  published under the name `deobfuscation_data_1.5.zip`, and only the last one
  survives. Ten early builds (`1.5-7.7.0.559`, `1.5-7.7.0.567` and their
  neighbours) want one of the two that are gone. horno refuses them by name and
  says why. Substituting the surviving data would let FML start, but it would be
  mapping data from another build, and mods would break without a message.
- **Realms does not open in a processor install.** The `DEOBF_REALMS` processor
  assumes the official launcher's directory layout. horno skips it and prints
  that it did.
- **Installers with conditional JVM arguments are refused.** horno cannot apply
  them, so it stops rather than drop one silently.
- **Before 1.6, the game logs a failed sound download.** Vanilla's pre-1.6 sound
  and music fetch hits a bucket Mojang retired. It is logged as
  `FileNotFoundException` and does not stop the game. The game then reads
  `resources/` in its own directory, which is where opys places those assets.
- **horno installs the loader's half only.** Assets, the asset index and the
  vanilla version are a launcher's job. A standalone install leaves them to you.
