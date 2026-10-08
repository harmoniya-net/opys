# Version documents

This page covers the version documents that opys reads for Forge, NeoForge,
Cleanroom and lwjgl3ify: what is published, what a document looks like, how
one names [horno](/internals/horno) and the loader's installer, and how the
set is kept current. Read it if you are changing a loader plugin, or if you
want to point a plugin at a mirror.

For a pack author the short version is this: the plugin picks a build from an
index, fetches one document, and treats it as a Mojang version JSON. You do not
need to read any of this unless you are hosting your own copy.

## What is published

Each document is generated from the loader's own installer or release, and
all of them are served from GitHub Pages at
`https://harmoniya-net.github.io/metadata/`. They are regenerated every night
(see [Regeneration](#regeneration)). The generator is in
[harmoniya-net/metadata](https://github.com/harmoniya-net/metadata).

```
https://harmoniya-net.github.io/metadata/
  index.json                          the four families and where each index is

  forge/
    index.json                        every Minecraft version and its builds
    versions/<mc>/<build>.json        one build's document
    versions/<mc>/latest.json         a copy of the build each alias names
    versions/<mc>/recommended.json
    versions/<mc>/best.json
    skipped.json                      builds that produced nothing, and why

  neoforge/                           the same layout
  cleanroom/                          the same layout
  lwjgl3ify/                          the same layout
```

Each family has one index. It lists every Minecraft version the family has
builds for, and under each version its builds and three aliases: `latest`,
`recommended` and `best`. `best` is `recommended` when there is one and
`latest` otherwise. A bare Minecraft version such as `1.20.1` resolves to its
`best` build. `recommended` is `null` when the family has nothing to recommend:
a NeoForge version with only prereleases, for example.

GitHub Pages serves files and not redirects, so an alias is also a file: each
alias file under `versions/<mc>/` is a copy of the document it names.

The root `index.json` lists the four families and where each index is. It has
no builds of its own.

## The index

A family's `index.json` has a `versions` key and a `generated` key (an ISO
timestamp). Forge and NeoForge indexes also have a `horno` key, with the release
tag and main class their documents name. Cleanroom and lwjgl3ify indexes do not,
because their documents do not name horno. Each entry in `versions` looks like
this:

```json
{
  "latest": "1.20.1-47.4.26",
  "latestUrl": "https://harmoniya-net.github.io/metadata/forge/versions/1.20.1/1.20.1-47.4.26.json",
  "recommended": "1.20.1-47.4.10",
  "recommendedUrl": "https://harmoniya-net.github.io/metadata/forge/versions/1.20.1/1.20.1-47.4.10.json",
  "best": "1.20.1-47.4.10",
  "bestUrl": "https://harmoniya-net.github.io/metadata/forge/versions/1.20.1/1.20.1-47.4.10.json",
  "builds": [
    {
      "build": "1.20.1-47.4.25",
      "url": "https://harmoniya-net.github.io/metadata/forge/versions/1.20.1/1.20.1-47.4.25.json"
    },
    {
      "build": "1.20.1-47.4.26",
      "url": "https://harmoniya-net.github.io/metadata/forge/versions/1.20.1/1.20.1-47.4.26.json"
    }
  ]
}
```

`builds` is cut to two entries here; the real one lists every build, oldest
first.

The `url` fields are absolute. A reader never builds a document address from
the index's own address; it follows the URL it was given.

How each family decides `latest` and `recommended`:

- **Forge** takes its promotions from Forge's own endpoint. Forge's promotion
  tag is its own version, not the build id, so the generator matches on the
  extracted version. `1.7.10` repeats the Minecraft version in its build id,
  and this is why.
- **NeoForge** publishes no promotions. `latest` is the newest build.
  `recommended` is the newest build whose version has no qualifier.
- **Cleanroom** and **lwjgl3ify** read GitHub's prerelease flag on each
  release. `latest` is the newest release, and `recommended` is the newest one
  not marked as a prerelease.

Every family also publishes `skipped.json`: each build that could not be turned
into a document, with the reason. A build listed there is not in the index.

## A document

Every document is an ordinary Mojang version JSON, but the families are not
all the same kind. There are two shapes.

### Forge and NeoForge: a patch

A Forge or NeoForge document is a patch. It has `inheritsFrom`, and the
launcher, or opys's fold, merges it onto the vanilla version of the same
Minecraft version. This is the shape of a 1.13 or later build,
`forge/versions/1.20.1/1.20.1-47.4.10.json`, trimmed to the parts that are not
ordinary. Older builds name less of horno, or none of it; see
[How a document names horno](#how-a-document-names-horno).

```json
{
  "id": "1.20.1-forge-47.4.10",
  "inheritsFrom": "1.20.1",
  "mainClass": "net.harmoniya.horno.Main",
  "arguments": {
    "jvm": [
      "-Dhorno.librariesDir=${library_directory}",
      "-Dhorno.installer=${library_directory}/net/minecraftforge/forge/1.20.1-47.4.10/forge-1.20.1-47.4.10-installer.jar",
      "-Dhorno.installerUrl=https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1-47.4.10/forge-1.20.1-47.4.10-installer.jar",
      "-Dhorno.installerSha1=66bfea9963bfa60d88bab6b2750e74a958392715",
      "-Dhorno.minecraft=${library_directory}/com/mojang/minecraft/1.20.1/minecraft-1.20.1-client.jar"
    ]
  },
  "libraries": [
    {
      "name": "net.minecraftforge:fmlloader:1.20.1-47.4.10",
      "downloads": {
        "artifact": { "path": "…", "url": "…", "sha1": "…", "size": 267079 }
      }
    },
    {
      "name": "com.mojang:minecraft:1.20.1:client",
      "downloads": {
        "artifact": { "path": "…", "url": "…", "sha1": "…", "size": 23028853 }
      }
    },
    {
      "name": "net.harmoniya:horno:0.1.6",
      "downloads": {
        "artifact": {
          "path": "net/harmoniya/horno/0.1.6/horno-0.1.6.jar",
          "url": "https://github.com/harmoniya-net/horno/releases/download/0.1.6/horno-0.1.6.jar",
          "sha1": "96cf5868da7446680a5355638aec22ba4c8dd5c9",
          "size": 103073
        }
      }
    }
  ]
}
```

The document has about thirty libraries in all. The ones that matter here are:

- **`mainClass`** is `net.harmoniya.horno.Main`. A launcher starts it like any
  main class. The builds from 1.6.1 to 1.12.2 are the exception: their
  `mainClass` is Forge's own LaunchWrapper.
- **`horno` as a library.** horno is an ordinary entry in `libraries`, so the
  launcher downloads it and puts it on the class path. On the pre-1.13 path,
  horno leaves its own jar off the game's class path before it hands off; see
  [horno](/internals/horno).
- **The vanilla client jar as a library.** The document declares
  `com.mojang:minecraft:<mc>:client` so that `${library_directory}` can address
  it. A launcher that follows `inheritsFrom` fetches it a second time. The
  generator accepts that cost rather than require a launcher to be told where
  the jar is.
- **The installer is not a library.** It is named only in `-Dhorno.installer`,
  `-Dhorno.installerUrl` and `-Dhorno.installerSha1`. It is an input to horno,
  not a runtime dependency, and on the class path it would collide with the
  loader's own jar.

### Cleanroom and lwjgl3ify: a whole version

Cleanroom and lwjgl3ify documents are complete version JSONs. They have no
`inheritsFrom` and do not name horno. Nothing has to be folded and nothing runs
first.

- **Cleanroom** unpacks one jar and has never run a processor, so its document
  lists that jar as an ordinary library. From 0.5.16-alpha on, Cleanroom ships
  the complete document itself. Earlier releases shipped patches over 1.12.2,
  and the generator folds them onto it. One rule is applied there and nowhere
  else: vanilla's LWJGL 2 is removed, because LWJGL 3 is published under a
  different group and a plain merge would keep both. The fold also leaves out
  vanilla's `javaVersion` and `logging`: Cleanroom has never run on vanilla
  1.12.2's Java 8, and the logging configuration belongs to a log4j that
  Cleanroom replaces.
- **lwjgl3ify** has no installer. Each release ships a `version.json`, which the
  generator republishes with its libraries made installable: paths derived,
  missing hashes filled in, and the ones its maven has dropped addressed at the
  release's own assets. A document cannot say that lwjgl3ify is also a mod, so
  its jar and UniMixins are not in the document. opys adds them to `mods/` from
  GitHub Releases. See [lwjgl3ify](/plugins/lwjgl3ify).

## How a document names horno

For a Forge or NeoForge build that has a processor install, the document names
the installer with three properties:

| Property                       | Names                                          |
| ------------------------------ | ---------------------------------------------- |
| `-Dhorno.installer=<path>`     | where the installer belongs under `libraries/` |
| `-Dhorno.installerUrl=<url>`   | where to fetch it, on the loader's own maven   |
| `-Dhorno.installerSha1=<sha1>` | what it must hash to                           |

`-Dhorno.librariesDir` and `-Dhorno.minecraft` are named the same way. Horno
fetches the installer itself, verifies it against the sha1, and reads it as
data. See [horno](/internals/horno) for what happens after that.

Pre-1.13 builds name the jar-mod path instead. A 1.5.2 document names
`-Dhorno.mainClass`, `-Dhorno.minecraft` and `-Dhorno.patched`. A 1.4.7
document also names `-Dhorno.jarmod`, `-Dhorno.jarmodUrl` and
`-Dhorno.jarmodSha1`, where the URL and sha1 lists are space-separated. A
1.6.1 to 1.12.2 document names no horno property at all, because Forge there is
a LaunchWrapper tweaker and a list of libraries.

Every `-Dhorno.*` argument is a JVM argument. A launcher passes it through and
does not read it. opys does the same: the arguments are part of the manifest,
and the manifest is the contract. The one place opys looks is `opys install`,
which checks whether any argument starts with `-Dhorno.` to know whether there
is a loader install step to run.

## Using a different index

Each of these four plugins takes a `source` option that replaces the index
address:

| Plugin                     | Options                                           | Default index                                        |
| -------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| `forge(version, opts)`     | `source`, `manifestBase`                          | `https://harmoniya-net.github.io/metadata/forge`     |
| `neoforge(version, opts)`  | `source`, `manifestBase`                          | `https://harmoniya-net.github.io/metadata/neoforge`  |
| `cleanroom(version, opts)` | `source`                                          | `https://harmoniya-net.github.io/metadata/cleanroom` |
| `lwjgl3ify(version, opts)` | `source`, `repo`, `token`, `apiBase`, `unimixins` | `https://harmoniya-net.github.io/metadata/lwjgl3ify` |

The defaults are exported as `DEFAULT_FORGE_INDEX`, `DEFAULT_NEOFORGE_INDEX`,
`DEFAULT_CLEANROOM_INDEX` and `DEFAULT_LWJGL3IFY_INDEX` from each package.

```js
forge('1.20.1', { source: 'https://mirror.example.com/metadata/forge' });
```

`manifestBase` on Forge and NeoForge is different. It is the address to read
Mojang's version manifest from in place of Mojang's own, and the fold uses it to
fetch the vanilla version. It does not change where the Forge index or documents
come from. `repo`, `token` and
`apiBase` on lwjgl3ify are for GitHub, which is where it reads its releases
and mod jars.

A mirror has to publish its own documents. Index URLs are absolute, so
`source` alone is not enough: the generator writes each URL against
`SITE_BASE`, which defaults to the public address. Run it with `SITE_BASE` set
to where the mirror will be served, or the index will point back at
harmoniya-net.github.io.

## Regeneration

The `Version documents` workflow (`pages.yml` in the metadata repository)
regenerates the documents. It runs the tests, then each generator, then copies
`static/` into the site. It can be started by hand, and otherwise starts in
two ways:

- **Nightly.** It runs every day at 05:17 UTC.
- **On a horno release.** Forge and NeoForge documents name a horno release by
  URL and sha1, so a new release makes them stale. horno's release workflow
  dispatches the metadata workflow when a token is configured. Without the
  token, the step prints the command to run by hand: `gh workflow run pages.yml
-R harmoniya-net/metadata`.

The workflow reads the horno tag from the latest horno release at the moment it
runs, so a regenerated set always names the newest release.

To generate locally, run one generator from the `metadata` repository:

```sh
node src/index.mjs                       # every Forge build
node src/index.mjs --mc 1.7.10           # one Minecraft version
node src/neoforge-index.mjs              # every NeoForge build
node src/cleanroom-index.mjs             # every Cleanroom release
node src/lwjgl3ify-index.mjs             # every lwjgl3ify release
node src/root-index.mjs                  # the site root's index.json
```

A run limited with `--mc` or `--only` does not rewrite `index.json` or
`skipped.json`, because a slice does not know which builds exist. `--only`
writes that one document and leaves the alias files alone as well, because one
build is not evidence about which is newest. `--mc` still refreshes the alias
files for its Minecraft version. Only the Forge and NeoForge generators take
`--mc`.

| Environment variable | Meaning                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `HORNO_TAG`          | The horno release the documents name. Default `0.1.0`; the workflow sets it to the latest release. |
| `HORNO_JAR`          | A local horno jar to hash, for a release that does not exist yet.                                  |
| `SITE_BASE`          | The address the index's URLs are absolute against.                                                 |
| `CONCURRENCY`        | Parallel builds. Default 12.                                                                       |
| `GITHUB_TOKEN`       | Optional. Lets listing GitHub releases go past the anonymous limit.                                |

Everything read from the network is cached under `.cache/`, so only the first
run is slow.

## Files served as they are

Two files that horno needs for Forge 1.5 and 1.5.1 are not generated. They are
copied in from `static/fmllibs/`, because the host that served them is gone and
no Maven repository carries them. horno checks each against the sha1 the build
asks for. See [horno](/internals/horno).
