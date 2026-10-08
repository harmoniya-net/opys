# Troubleshooting

This page is for a pack that does not start: the build fails, the install
stops, or the game exits. Find the symptom below. Start with the exit code,
because it says which half of opys failed before you read anything else.

## Start with the exit code

`opys` exits with one of these codes. The full list is on
[The opys command](/guide/cli); the `code` a launcher sees for the same
failures is on [Errors](/launcher/errors).

| Exit | Meaning                                                                                                                             | Where it is covered                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 0    | Success.                                                                                                                            |                                                              |
| 1    | A usage or config error, a failure while building, a runtime failure with no exit code of its own, or an unexpected internal error. | [Build and config errors](#build-and-config-errors)          |
| 2    | A network error during install.                                                                                                     | [A download fails](#a-download-fails-exit-2)                 |
| 3    | An integrity check failed.                                                                                                          | [An integrity check fails](#an-integrity-check-fails-exit-3) |
| 4    | An archive could not be extracted.                                                                                                  | [Exit 4](#exit-4-extraction-failed)                          |
| 5    | The game, or horno's install pass, started and then exited with a failure.                                                          | [The game exits](#the-game-exits-exit-5)                     |

Exit 1 covers several things. A usage error, or a runtime failure with no exit
code of its own (`manifest`, `io`, `cancelled`, `other`), prints `Error:` and its
message. Everything else prints `Unexpected error:` and its message, then the
stack: a config that throws, a plugin that fails while building, a bundle that
cannot be read. Codes 2 to 4 describe the install only, so a plugin that cannot
reach its API while building also exits 1. Read the message on the first line
before the stack. Set `OPYS_QUIET=1` to leave the stack out.

## Build and config errors

### The build prints a `warning: var ... set by both`

Two plugins set the same variable, or the same launch environment variable.
The build finishes, and the later plugin's value is used. The warning has the
form:

```
[opys] warning: var 'root' set by both 'minecraft' and 'forge' — using 'forge'
```

Plugins are merged in the order you list them in `plugins`, so the last one
listed wins. The usual cause is listing `minecraft()` next to a loader. A loader
already brings the vanilla game, so the two define the same variables, and you
get one line for each. Remove the `minecraft()` entry.

If two plugins claim a name you did not expect, the wrong one may be the one
that wins. If you meant to override it, set the value in `manifest.vars`: that
is the override layer, and it does not warn.

`manifest.vars` is baked into the bundle, so it takes build-time constants
only. A path on your disk does not belong there; see the next section.

### It works for you and fails for players

The usual cause is a machine-specific value in `manifest`. Anything in
`manifest` is written into the bundle, so a path such as
`/home/you/.local/share/my-pack` or your username is the same on every
player's machine. It runs on yours, because the path exists there.

Move the value to `runClient`, which runs on the launching machine every time
the game starts:

```js
runClient: (manifest) => ({
  vars: { ...manifest.vars, root: userDataDir('my-pack') },
}),
```

`userDataDir()` resolves the build machine's home directory, so it must never
go in `manifest.vars`. The reasoning is on
[Concepts](/guide/concepts#two-machines-and-what-belongs-to-each). For a bundle,
which has no `runClient`, pass the value with `--var`.

### A path contains a literal `${something}`

A `${name}` in a path is replaced with the value of `name`. If no value exists
for `name`, the runtime leaves the text `${name}` in place and does not stop
with an error. The path then points at a directory that does not exist, and
the game fails later with a file-not-found error.

Check that the name is spelled the same way in the manifest and in
`runClient`, or in the `--var` you pass to a bundle. The variables the
manifest leaves open are listed on [Variables](/launcher/vars).

### A version is not found

A loader or Java version that no index lists stops the build with a message that
names the string you gave:

| Message                                                  | Cause                                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Could not resolve Forge version '…' from <index>`       | The string is not an alias, a Minecraft version in the index, or a build id in it. NeoForge, Cleanroom and lwjgl3ify say the same with their own names |
| `Unknown Minecraft version '…' (resolving '…')`          | An alias such as `-latest` on a Minecraft version the index does not list                                                                              |
| `No 'recommended' Forge build available for Minecraft …` | That Minecraft version has no build with the alias you asked for. A bare version still resolves                                                        |
| `Version '…' not found in the Mojang version manifest`   | The version given to `minecraft()` is not a Mojang version id                                                                                          |
| `… returned HTTP 400` from `meta.fabricmc.net`           | Fabric Meta does not know the Minecraft version or the pinned `loader`. Fabric takes no aliases                                                        |
| `No Temurin binaries found for version '…'`              | No release matches the Java version. See [Java](/guide/java#choosing-a-version)                                                                        |

[Loaders](/guide/loaders#version-strings) lists what each version string accepts.

## Known upstream limits

A few Forge builds do not start on the Java their Minecraft version normally
takes, and some cannot be installed at all. Pin the Java for a build by passing
its version to `java()`.

### Forge 1.7.2 dies on Java 8

Forge 1.7.2 predates Java 8 and does not start on it: the log ends in a
`ConcurrentModificationException` from LaunchWrapper, which sorts a list
while changing it, something Java 8 stopped allowing. It needs Java 7:

```js
plugins: [forge('1.7.2'), java('7', { vendor: 'zulu' })],
```

Temurin does not publish Java 7, which is why the example names Zulu.

### Forge for Minecraft 1.16.4 fails on a recent Java 8

Forge for 1.16.4 reads a JDK internal that Java 8u321 changed. Pin the last
update before that change:

```js
plugins: [forge('1.16.4'), java('8u312-b07')],
```

For the default vendor, Temurin, `java()` takes the exact Adoptium release
name, and the `jdk` prefix is optional. `8u312-b07` is passed as written.

### Ten early Forge 1.5 betas cannot be installed

Ten early Forge 1.5 builds, among them `1.5-7.7.0.559` and `1.5-7.7.0.567`,
need deobfuscation data that Forge published under a name and later replaced, and
no copy of the original survives. There is no fix on the opys side. horno
refuses these builds by name rather than letting the game report a dead host,
and its message says that no copy of the file survives. It appears when
`opys install` or `opys launch` runs horno, so it ends in
[exit 5](#the-game-exits-exit-5).

A later build for the same Minecraft version does not have the problem, and the
bare version string resolves to the newest one:

```js
plugins: [forge('1.5'), java('8')],
```

A full build id is accepted wherever a version is, as the
[Forge plugin](/plugins/forge) describes, so a pack that pinned one of the ten
only has to name another.

## A download fails (exit 2)

The output starts with `Network error: HTTP <status> downloading <url>`.

A status of `0` means no response came at all: the connection failed, or the
body stopped arriving partway through. Any other status is what the server
sent back. A `404` usually means the file has moved or been removed upstream.
Rebuild the bundle so the manifest points at what the source now serves.

When a download fails, run the command again. Files that finished and passed
their check are skipped on the next run, so you do not download them twice.

opys has already retried by the time you see this. Each file is tried four
times, waiting half a second, two seconds and eight seconds between
attempts, so a network error means the failure lasted longer than that.

## An integrity check fails (exit 3)

The output starts with `Integrity check failed:` and lists the paths. An
artifact in a manifest names the hash its file must have. A file that does not
match after it was downloaded is refused, and the install stops before anything
is extracted.

A file that is already on disk and does not match is not an error. It is
downloaded again. So if the failure keeps coming back, the bytes the source
serves are not the bytes the manifest pinned. That happens when a file changes
upstream after the bundle was built.

The fix is to rebuild with `opys build` and publish the new bundle. A
manifest is a snapshot: it does not follow upstream on its own, and a rebuild
is what re-resolves the plugins and pins what they report now. Players cannot
fix this themselves, and a bundle that is already published stays as it was
built, so a player needs the republished bundle.

## Exit 4: extraction failed

The output says `Extraction failed:` with the artifact path and, on the next
line, `caused by:`. The archive could not be unpacked into place. Read the cause
line, which says whether the archive is damaged or something could not be
written. An archive that pins a hash was checked before extraction, so a damaged
one came from the build: rebuild the bundle. A write that failed is the
machine's, such as a full disk or a path the player cannot write to.

## The game exits (exit 5)

The output says `The game exited with code <n>`. The install succeeded. What
it started then failed on its own. The game's own output is printed above
that line, and that output is what to read.

The same code covers horno's install pass. Where a manifest runs horno to
set up a loader, `opys install` runs it once, with nothing to launch afterwards,
and a failure there is reported as exit 5 too, with horno's own output above
the line. `opys launch` does not run it separately: horno runs as part of the
game's start, and its failure shows up as the game exiting.

## The log shows `FileNotFoundException: http://s3.amazonaws.com/MinecraftResources/`

This is harmless on the old versions. Forge 1.1 and 1.2.5 both log it on
launch. It comes from vanilla's pre-1.6 sound and music downloader, which
points at a bucket Mojang has retired, and not from Forge or horno.

The game goes on without that download. It reads its sounds from the
`resources/` folder in its own directory, which opys fills with those assets
for these versions.

## Next

- [The opys command](/guide/cli) lists the flags and the exit codes.
- [Errors](/launcher/errors) lists the error codes a launcher receives.
- [Launch-time values](/guide/run-client) explains what belongs in
  `runClient` and what belongs in the manifest.
