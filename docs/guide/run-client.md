# Launch-time values

This page covers `runClient`, the part of a config that runs on the machine
that launches the game. It shows where a root directory, a player's name and
an access token go, and why they never go in the manifest. It is for pack
authors; the reasons are in [Concepts](./concepts#two-machines-and-what-belongs-to-each).

## What `runClient` is

`runClient` is an optional function in your config. `opys launch` and
`opys install` call it on every run, after the manifest is built, and merge
what it returns over the manifest:

```js
runClient: (manifest) => ({
  vars: { ...manifest.vars, root: userDataDir('my-pack') },
}),
```

The merge is shallow and per field. Each field you return replaces the
same field of the manifest, and fields you leave out are kept. That makes
`vars` a replacement, not an addition: if you return `vars`, it must contain
everything the manifest's `vars` held, which is why the example spreads
`manifest.vars` first. The function receives the built manifest, so you can
read its variables if you need them.

`runClient` runs only when a machine starts or installs the game. `opys build`
never calls it, so it cannot change what is published.

## Why machine values go here

A manifest is published. Every player who installs a bundle gets its `vars`
exactly as they are. Anything you put there is shared by all of them and is
written into the file.

Two kinds of value must not be shared that way:

- **Paths on a machine.** `userDataDir()` runs on the machine that evaluates
  it. Called at build time, it would bake your home directory into the
  bundle, and every player would install into it.
- **Credentials.** A player's access token belongs to that player and expires.
  It must be made when the game starts, not when the bundle is built.

`runClient` is the one place that runs on the launching machine, every time.
Put machine paths and credentials there.

::: warning
Do not call `userDataDir()` in `manifest.vars`, and do not put a token there.
Both are baked into the bundle.
:::

## Where the game lives: `userDataDir`

`userDataDir(name)` from `@opys/dev` returns a per-user data directory for an
application called `name`. It only builds a path; it creates nothing.

| System  | Directory                                                              |
| ------- | ---------------------------------------------------------------------- |
| Linux   | `$XDG_DATA_HOME/<name>`, or `~/.local/share/<name>`                    |
| macOS   | `~/Library/Application Support/<name>`                                 |
| Windows | `%APPDATA%\<name>`, or under your home directory if `APPDATA` is unset |

Use the same name in every config for the same pack, so that a later launch
finds the files an earlier one installed.

## Values a Minecraft manifest leaves open

A manifest built with `minecraft()` expects some variables from the launching
machine. The table lists the ones the plugin defines and a player might need
to change.

| Variable   | Default | Used for                                                            |
| ---------- | ------- | ------------------------------------------------------------------- |
| `root`     | `.`     | The installation directory. Every other directory is built from it. |
| `username` | none    | The player's name, passed to the game as `auth_player_name`.        |
| `uuid`     | none    | The player's UUID, passed as `auth_uuid`.                           |
| `token`    | none    | The access token, passed as `auth_session` and `auth_access_token`. |

`root` has a default in the manifest: `.`, the directory the game is started
from. A bundle that you never give a `root` installs into the current
directory. Set it in `runClient` or with `--var`, as in the examples on this
page.

`username`, `uuid` and `token` have no default. A name that nothing defines is
left as written, so the game receives the literal text `${username}` as the
player's name and nothing reports it. Supply all three.

The rest of the vanilla variables are fixed by the plugin and need no value
from you. Among them are `launcher_name` (`opys`), `user_type` (`mojang`),
`user_properties` (`{}`) and the directories derived from `root`:
`game_directory`, `assets_root`, `library_directory` and `version_dir`.
[Variables](/launcher/vars) lists them all, along with `java_bin`, which the
`java` plugin defines.

::: tip
For playing offline, `username`, `uuid` and `token: '0'` are enough. The
[getting started](./getting-started#write-a-config) config shows the full
`runClient` for that.
:::

## Signed-in players

A token for a server that you run is not a string you type. The
`resolveBifrost` helper, exported by `@opys/minecraft`, mints one inside
`runClient`: it signs an Ed25519 token for the username and UUID you give it,
using a private key you pass in. It returns `{ username, uuid, token }`, and
spreading that into `vars` supplies all three values:

<<< @/examples/runclient-bifrost/opys.config.mjs

The key is read from the environment when `runClient` runs, so it is needed
for `opys launch` and `opys install` but not for `opys build`. The server must trust the matching
public key. [Accounts, servers, GPUs](./extras) covers the server side and the
other helpers.

## Launching a bundle

A bundle has no `runClient`. A config is code, and a bundle is data: a
launcher that installs a bundle, or `opys launch <bundle>`, runs no config at
all. The launch-time values come from the command line instead:

```sh
opys launch game.opys --var root=/path/to/install --var username=Player \
  --var uuid=00000000-0000-0000-0000-000000000001 --var token=0
```

`--var` also works with `opys launch` and `opys install` from a config. A
`--var` overrides the value `runClient` returned for the same key, so you
can point one run at another directory without editing the config.

A variable is a string, or a list of conditional values (`{ value, rules }`)
that pick a string by rule, such as the platform. In a config, opys checks every variable of the
manifest once `runClient` has been applied and stops with an error if one is
neither.
