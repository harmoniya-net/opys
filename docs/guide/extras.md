# Accounts, servers, GPUs

This page is for a pack author who wants players to sign in against a server
you run, wants your server in the multiplayer list, or wants the game on the
discrete GPU. Four packages cover that: `authliberty` and `bifrost` for
accounts, `serverlist` for the server list, and `dgpuj` for the GPU. Each
section starts with the task. Every option is on the plugin's own page.

A player's name, UUID and token are values for the launching machine, so they
go in [`runClient`](/guide/run-client): a manifest is baked into the bundle that
every player gets. `authliberty`, `serverlist` and `dgpuj` are plugins. They run
when you build, and the bundle carries what they produce.

## Play without an account

`token: '0'` starts the game without a Microsoft account. The `username`,
`uuid` and `token` vars are the player's name, UUID and access token. The game
plugins pass them on as `auth_player_name`, `auth_uuid` and `auth_access_token`
(and `auth_session`, which takes the token too). opys does not check the token
and signs nothing with it, so `'0'` is a placeholder. It is enough for
single-player and for servers that run in offline mode.

Set the three in `runClient`:

```js
runClient: (manifest) => ({
  vars: {
    ...manifest.vars,
    root: userDataDir('my-pack'),
    username: 'Player',
    uuid: '00000000-0000-0000-0000-000000000001',
    token: '0',
  },
}),
```

`runClient` replaces each field it returns, so spread `manifest.vars` into
`vars`, or the plugins' own vars are lost.

## Sign players in against your own server

Two pieces do this, and they do different jobs. `authliberty` loads a
`-javaagent` that points the game's calls to the Mojang hosts at a server you
name. That server speaks Yggdrasil, the protocol Mojang's own auth uses.
`bifrost` mints the token that a [Bifrost](https://gitlab.com/harmoniya/bifrost)
server checks. The agent decides where the game connects; the token decides who
the player is.

### Point the game at your server: authliberty

`authliberty` is an authlib-injector style agent. It contributes two things:

- **One artifact**: the agent jar, under
  `${library_directory}/net/harmoniya/authliberty/<version>/`, pinned by the
  sha256 GitLab reports for it when there is one.
- **One launch group, `jvmArgs`**: `-javaagent:<path>`, then one
  `-Dminecraft.api.<server>.host=<url>` for each host you set.

A host you leave out stays on Mojang's server.

| `hosts` key | System property                 | Mojang default                      |
| ----------- | ------------------------------- | ----------------------------------- |
| `auth`      | `-Dminecraft.api.auth.host`     | `https://authserver.mojang.com`     |
| `account`   | `-Dminecraft.api.account.host`  | `https://account.mojang.com`        |
| `session`   | `-Dminecraft.api.session.host`  | `https://sessionserver.mojang.com`  |
| `services`  | `-Dminecraft.api.services.host` | `https://api.minecraftservices.com` |

`hosts` can also be a function. It is called once for each of those four keys
and returns a URL, or `undefined` to leave that one on Mojang's.

The version is exact, such as `'0.3'`, or `'latest'`. The `latest` build is
replaced whenever AuthLiberty's `main` builds, and its hash is frozen at build
time, so rebuild to pick up a new one.

Add the plugin to `plugins`, and put its launch group first in `args`, so the
redirect is in place before any auth code runs:

```js
plugins: [
  minecraft('1.20.1'),
  authliberty('0.3', {
    hosts: {
      auth: 'https://auth.example.com',
      session: 'https://auth.example.com',
    },
  }),
  java('17'),
],
manifest: {
  command: ({ java }) => java.bin,
  args: ({ authliberty, minecraft }) => [
    authliberty.jvmArgs,
    minecraft.jvmArgs,
    minecraft.mainClass,
    minecraft.gameArgs,
  ],
  workdir: '${game_directory}',
},
```

`authliberty.jvmArgs` goes ahead of `minecraft.jvmArgs`. The `project`,
`gitlab` and `token` options say where the jar is published; they are on the
[authliberty page](/plugins/authliberty).

### Mint the player's token: bifrost

`bifrost` is a helper, not a plugin. It has no factory and contributes nothing
to the manifest. You call `resolveBifrost` inside `runClient`, once per launch.
It signs an Ed25519 JWT (`alg: EdDSA`) with the claims `uuid`, `username`,
`iat` and `exp`, the shape Bifrost's own `/token` endpoint issues, so a Bifrost
server accepts it against the matching public key. The token lasts a day by
default.

`resolveBifrost` is exported from `@opys/bifrost`. `@opys/minecraft` re-exports
it as `resolveBifrost` and as `bifrost`. It takes `privateKey` (an Ed25519 key
as PKCS#8 PEM), `username` and `uuid`, and returns `{ username, uuid, token }`,
with the UUID written without dashes. The [bifrost page](/plugins/bifrost) lists
the other options.

Read the key from the environment and set the three vars in `runClient`:

```js
runClient: (manifest) => {
  const auth = resolveBifrost({
    privateKey: process.env.BIFROST_PRIVATE_KEY,
    username: 'Player',
    uuid: '00000000-0000-0000-0000-000000000001',
  });
  return {
    vars: {
      ...manifest.vars,
      username: auth.username,
      uuid: auth.uuid,
      token: auth.token,
    },
  };
},
```

The `username`, `uuid` and `token` vars are the same three as for offline play,
so they are set once, in the same place as `token: '0'`.

::: warning Keep the private key out of `manifest`
The manifest is written into the bundle, and every player who installs it gets
a copy. A key there is a key everyone has. `runClient` runs on the launching
machine on every launch, so the key is read from the environment there, as
above. If `BIFROST_PRIVATE_KEY` is unset, `resolveBifrost` throws and says so.
:::

## Pre-fill the server list

The `serverlist` plugin writes a `servers.dat` file into the game directory at
build time, so the player sees your servers in Multiplayer on first launch.
Nothing is fetched at install: the file is generated and carried in the bundle
as a blob. Add it to `plugins`:

```js
plugins: [
  minecraft('1.20.1'),
  java('17'),
  serverlist([
    { name: 'My SMP', ip: 'mc.example.com' },
    { name: 'Test server', ip: 'test.example.com' },
  ]),
],
```

Each entry takes three fields:

| Field   | Required | Meaning                                             |
| ------- | -------- | --------------------------------------------------- |
| `name`  | yes      | The label shown in the list.                        |
| `ip`    | yes      | The address, as the player would type it.           |
| `rules` | no       | Where the entry applies. Left out means everywhere. |

Any other field is an error at build, so an entry with `hidden` will not build.

The file goes to `${game_directory}/servers.dat`. The `path` option writes it
elsewhere; see the [serverlist page](/plugins/serverlist).

Entries with `rules` are grouped by ruleset, and entries without rules form a
group of their own. Each group becomes one `servers.dat`, scoped to the group's
rules.

::: warning Only one ruleset survives
Every group's file goes to the same path, and a manifest keeps one artifact per
path, the last one. So a list that has more than one group, counting the entries
without rules as one, keeps only the last group's file. On a machine where that
group's rules do not hold, no list is installed at all. Use a single ruleset
across your server lists.
:::

The file is pinned by its hash, so the installer puts it back whenever the
player's copy differs. Servers a player adds in the game are replaced at the
next install. An empty list still writes a file, so `serverlist([])` clears the
list.

## Use the discrete GPU

On a machine with an integrated and a discrete GPU, the choice is made per
process, for the process that creates the OpenGL context. A launcher that
starts `javaw` as a child cannot change that choice for the game, because the
game is a different process. So `dgpuj` has to be the launch `command` itself.
It asks for the discrete GPU in its own process, then runs the JVM inside it.

What it does differs by system. On Windows the launcher exports the symbols the
NVIDIA and AMD drivers look for. On Linux it sets NVIDIA's PRIME render-offload
variables, and only when the proprietary NVIDIA driver is present. On macOS
there is nothing to force, so it only hosts the JVM. The
[dgpuj repository](https://github.com/harmoniya-net/dgpuj) has the details.

```js
plugins: [forge('1.20.1'), java('17'), dgpuj()],
manifest: {
  command: ({ dgpuj }) => dgpuj.bin,
  args: ({ dgpuj, forge }) => [
    dgpuj.home,
    forge.jvmArgs,
    forge.mainClass,
    forge.gameArgs,
  ],
  workdir: '${game_directory}',
},
```

`dgpuj.bin` is the launcher binary. `dgpuj.home` expands to
`--dgpuj-home ${java_home}`, which tells the launcher where the JVM is. It goes
first in `args`. You can leave it out: the `java` plugin exports `JAVA_HOME` to
the launch environment, and the launcher reads that. Keep `dgpuj.home` only if
you set up the JVM location some other way and want to name it.

By default the plugin provides these platforms:

| OS      | Architecture | Archive   |
| ------- | ------------ | --------- |
| Windows | x86_64       | `.zip`    |
| Windows | aarch64      | `.zip`    |
| Linux   | x86_64       | `.tar.gz` |
| macOS   | x86_64       | `.tar.gz` |
| macOS   | aarch64      | `.tar.gz` |

Linux on aarch64 is not among them. Each archive is its own artifact, limited to
its OS and architecture, so a player downloads only the one for their machine,
and each is pinned by a sha256 hash.

The `version` option picks `'latest'` (the default), `'prerelease'`, or an exact
tag such as `'v0.3.0'`. The plugin owns `dgpuj_dir`, which is `${root}/dgpuj` by
default, and `dgpuj_bin`, which points at the binary for each OS. The other
options are on the [dgpuj page](/plugins/dgpuj).
