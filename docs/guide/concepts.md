# Concepts

opys has four ideas. Once they are clear, the rest of the documentation is
detail.

## A manifest describes an installation

A **manifest** is a list of files and a command line. Each file, called an
**artifact**, says where it goes, where it comes from and what its hash must
be. The command line says how to start the game once the files are in place.

```json
{
  "artifacts": [
    {
      "path": "${library_directory}/com/mojang/brigadier/1.3.10/brigadier-1.3.10.jar",
      "source": {
        "url": "https://libraries.minecraft.net/…/brigadier-1.3.10.jar"
      },
      "integrity": { "sha1": "d15b53a14cf20fdcaa98f731af5dda654452c010" }
    }
  ],
  "launch": {
    "command": "${java_bin}",
    "args": ["-cp", "…", "net.minecraft.client.main.Main"],
    "workdir": "${game_directory}"
  }
}
```

A manifest is **fully resolved**. It never says "the latest Forge" or "ask
this server which file to fetch". Every artifact names one concrete file, and
wherever a hash can be had, pins it. Working out which files and which hashes
is done once, when the manifest is built.

That makes installing simple and safe: download, verify, extract, run. The
installer makes no decisions and trusts no server to tell it what is correct.
To follow an update, you build a new manifest.

## A bundle is how a manifest travels

Some files have no URL: a config you wrote, a private mod. Those are carried
alongside the manifest as **blobs**, each named by the sha256 of its content.

A **bundle** is a zip that holds the manifest and its blobs. It is the one
file `opys build` writes and the one file a launcher needs. Since it is a
plain zip, any tool can open it:

```sh
unzip -l game.opys
#   opys.json        the head: format, vars, launch, restrict
#   artifacts.json   the artifact list
#   blobs/<sha256>   one entry per carried file
```

The exact layout is in [the bundle format](/reference/bundle-format).

## Plugins build the manifest

Nobody writes a manifest by hand. A **plugin** contributes part of one:
`forge('1.20.1')` works out which libraries that Forge build needs and where
each lives, `java('17')` finds a JDK for every platform, `modrinth(…)` pins
the mod files you named.

A plugin contributes some of four things: artifacts (with the blobs they
carry), variables, environment variables, and pieces of the launch command.
Your config lists the plugins and then arranges those pieces:

```js
plugins: [forge('1.20.1'), java('17')],
manifest: {
  command: ({ java }) => java.bin,
  args: ({ forge }) => [forge.jvmArgs, forge.mainClass, forge.gameArgs],
},
```

Plugins run only while building. Nothing of a plugin exists on the machine
that installs the result, which is why a launcher needs only the small
runtime and not the toolkit.

## Two machines, and what belongs to each

This is the idea that causes mistakes when it is missed.

|            | Build machine             | Launch machine                      |
| ---------- | ------------------------- | ----------------------------------- |
| Who        | You, running `opys build` | A player, running the game          |
| Runs       | The plugins               | The runtime                         |
| Knows      | Versions, mods, hashes    | Its own paths, the player's account |
| Decided in | `plugins`, `manifest`     | `runClient`, or `--var`             |

Anything in `manifest` is baked into the bundle and is the same for every
player. So a path on your disk, your username or an access token must never
go there. Those are **launch-time values** and are supplied on the launching
machine, each time the game starts.

Variables are how the two halves meet. The manifest says
`${library_directory}/…`, which is built from `${root}`, and the launching
machine says what `root` is. The variables a manifest leaves open are listed
in [Variables](/launcher/vars).

When you run `opys launch` from a config, your computer is both machines at
once, which is convenient and is also why the distinction is easy to miss.
`runClient` is the launch half even then.

## How the pieces map to packages

| You are                               | You use                                                  |
| ------------------------------------- | -------------------------------------------------------- |
| Writing a pack                        | `@opys/cli`, `@opys/dev`, `@opys/minecraft`              |
| Writing a launcher                    | `@opys/runtime`                                          |
| Writing a plugin                      | `@opys/dev`, `@opys/core`                                |
| Reading bundles from another language | [The format](/reference/bundle-format), and nothing else |

The build side and the runtime never depend on each other. The manifest
format is the only thing they share, and it is the stable part: packages,
plugin APIs and command-line flags may change, the format changes only on
purpose.
