# The bundle

A bundle is the file `opys build` writes, usually `<name>.opys`. It is the
whole pack in one file, and the only thing a player or a launcher needs.

## What it is

A zip, with three kinds of entry:

```sh
unzip -l game.opys
#   opys.json        which format the bundle is written in
#   manifest.json    the files to install, and how to start the game
#   blobs/<sha256>   your own files, carried along
```

`manifest.json` is the **manifest**: every file the installation needs, and
the command that starts the game.

Each file in the list says where it goes, where it comes from, and what
hash it must have:

```json
{
  "path": "${library_directory}/com/mojang/brigadier/1.3.10/brigadier-1.3.10.jar",
  "source": { "url": "https://libraries.minecraft.net/…/brigadier-1.3.10.jar" },
  "integrity": { "sha1": "d15b53a14cf20fdcaa98f731af5dda654452c010" }
}
```

The game, its libraries and mods from Modrinth are **not** inside the
bundle. They are listed by URL and hash, and the player downloads them.

## The one rule: nothing is left to look up

A bundle never says "the latest Forge". Every file is one exact file with a
pinned hash. All choices were made when you ran `opys build`.

**Why:** installing becomes download, check, unpack, run. No server can
change what a player gets, and a pack that worked yesterday works today.

**The price:** a bundle does not update itself. To move to a newer mod, you
build again.

## Where your own files go

Files from the [`files`](/plugins/files) plugin have no
public URL. There are two ways to ship them:

|             | Carried (default)           | Hosted (`url` given)      |
| ----------- | --------------------------- | ------------------------- |
| Where       | Inside the bundle, as blobs | On your server            |
| You host    | The bundle only             | The bundle and every file |
| Bundle size | Grows with the files        | Stays tiny                |
| Good for    | Configs, a few mods         | Hundreds of megabytes     |

Start with carried. Nothing else has to stay online, and nothing can go
missing.

## Where a bundle is used

**Testing it yourself.** Launch the bundle the way a player would, without
your config:

```sh
opys launch game.opys --var root=/tmp/pack-test --var username=Player \
  --var uuid=00000000-0000-0000-0000-000000000001 --var token=0
```

Do this before publishing. It catches values that only exist in your `run`.

**Hosting it.** It is one file. Any static host works: a web server, an S3
bucket, a GitHub release.

**In a launcher.** Give the runtime the URL and it does the rest. See
[Launcher integration](./launcher).

::: tip You do not always need one
`opys launch` with no arguments builds your config, writes a temporary
bundle and installs from that. A bundle you keep is for sharing.
:::

## Shipping an update

Build again and replace the file at the same address. That is all.

On the next launch, files that still match their hash are left alone, and
only missing or changed ones are downloaded. A small update is a small
download.

Two things to remember:

- **Nothing moves until you rebuild.** `forge({ version: '1.20.1' })` is
  resolved on your machine, when you build.
- **Removed files stay** unless a [`cleanup`](./config#cleanup) rule covers
  them.

## What must stay out

A bundle is a zip. Anyone who has it can read all of it.

| Keep out                               | Put it                         |
| -------------------------------------- | ------------------------------ |
| Paths on your machine, `userDataDir()` | In `run`, or `--var` at launch |
| Usernames, UUIDs, access tokens        | In `run`, or `--var` at launch |
| Private keys, passwords                | Nowhere near `manifest`        |

API tokens you give to plugins (`curseforge`, `links`) are fine. They are
used while building and are not written into the bundle.

## Why it is built this way

**Why a zip?** So that no special tool is needed. `unzip` reads it, and so
does every language.

**Why two JSON files?** One describes the bundle, the other the
installation. `opys.json` is a few bytes, stored first and uncompressed, so
a tool can tell what a bundle is without reading the megabytes of manifest.

**Why are blobs named by hash?** The name is the integrity check. A bundle
cannot carry a file that does not match its own name.

**Why a `format` number?** So a reader can refuse a bundle written in
another format instead of misreading it. It is `1` today.

Writing your own reader or installer?
[The format](/format/) has every field.
