# Troubleshooting

Start with the exit code. It tells you which part failed before you read
anything else.

| Exit | What failed                           | Jump to                                         |
| ---- | ------------------------------------- | ----------------------------------------------- |
| 1    | The command, the config, or the build | [Build problems](#build-problems)               |
| 2    | A download                            | [A download fails](#a-download-fails)           |
| 3    | A hash check                          | [A hash does not match](#a-hash-does-not-match) |
| 4    | Unpacking an archive                  | [Unpacking fails](#unpacking-fails)             |
| 5    | The game itself                       | [The game exits](#the-game-exits)               |

## Build problems

### "there is no plugin named…" or an unknown group

A `'@name.group'` in your launch line points at nothing. The message lists
what does exist. Usually it is a typo, or the launch line still names
`minecraft` after you switched to `forge`.

### "a plugin takes one options object"

You wrote `forge('1.20.1')`. Plugins take an object:
`forge({ version: '1.20.1' })`. Likewise `` `runClient` is now `run` `` means
what it says: rename the key.

### A warning that a var is "set by both"

Two plugins set the same variable. The build continues and the later plugin
wins. The usual cause is listing `minecraft()` next to a loader. A loader
already includes the game, so remove `minecraft()`.

If you really do want to override a variable, set it in `manifest.vars`.
That is the intended place, and it does not warn.

### A version is not found

The message names the string you gave. Check it against
[Writing the version](/plugins/forge#version). Common causes:

- `-recommended` on a Minecraft version that has no recommended build. Use
  the bare version instead.
- An alias on `fabric` or `minecraft`, which take plain Minecraft versions.
- A Java version written in another vendor's style.

### It works for me and fails for players

Almost always a machine-specific value in `manifest`: a path under your home
directory, or `userDataDir()` in `manifest.vars`. It is baked into the bundle,
and it only exists on your computer. Move it to `run`.

The quick test is to launch the bundle the way a player would:
`opys launch game.opys --var root=/tmp/test …`.

### A path or the player's name is a literal `${something}`

A variable with no value is left as written, and nothing reports it. Check
the spelling, and check that it is set in `run` or passed with `--var`.
[Variables](/plugins/minecraft#variables) lists the names a pack expects.

## A download fails

`Network error: HTTP <status> downloading <url>`.

opys has already retried several times before you see this. Run the command
again: files that finished are not downloaded twice.

If it keeps failing with a `404`, the file has been moved or removed by
whoever hosts it. Rebuild the bundle so it points at what is published now.

## A hash does not match

`Integrity check failed:` followed by the files.

The server is sending different bytes from the ones the bundle pinned. That
happens when a file is replaced upstream after you built. Players cannot fix
it. Rebuild and publish a new bundle.

A damaged file that is _already on disk_ is not an error. It is simply
downloaded again.

## Unpacking fails

`Extraction failed:` with the archive, and a `caused by:` line. Read that
line. It is either a damaged archive (rebuild) or something the machine
would not allow, such as a full disk or a folder without write permission.

## The game exits

`The game exited with code <n>`.

opys did its part: everything installed and the game started. Whatever went
wrong is in the game's own output, printed above that line. Look for the
first exception.

Things that commonly cause it:

- **The wrong Java.** See
  [the table](/plugins/java#which-java-for-which-minecraft).
- **Forge 1.7.2** needs Java 7:
  `java({ version: '7', vendor: 'zulu' })`.
- **Forge 1.16.4** needs a Java 8 no newer than 8u312:
  `java({ version: '8u312-b07' })`.
- **A mod for another loader or Minecraft version.** opys installs what you
  name and does not check that it fits.
- **Ten early Forge 1.5 betas** (such as `1.5-7.7.0.559`) cannot be installed
  at all, because a file they need no longer exists anywhere. Use
  `forge({ version: '1.5' })`, which picks a later build.

## Harmless noise

`FileNotFoundException: http://s3.amazonaws.com/MinecraftResources/` in the
log of a very old version (Forge 1.1, 1.2.5) is the game looking for a sound
server Mojang shut down. The sounds are already installed locally and the
game carries on.
