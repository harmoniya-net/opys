# serverlist

`serverlist` writes the game's `servers.dat`, so the multiplayer screen already
lists your servers when a player first opens it. The file is built from the
list you give, encoded in the game's own format, and carried in the bundle
like any other file.

## Signature

```ts
serverlist(servers: ServerEntry[], options?: ServerlistOptions): ChainablePlugin

interface ServerEntry {
  name: string;
  ip: string;
  rules?: RulesetInput;
}
```

It is a plugin, so it goes in `plugins`. It is exported from `@opys/minecraft`
and from `@opys/minecraft-serverlist`, which also exports `DEFAULT_PATH`, the
path the file goes to unless you change it.

## Options

Each entry in `servers` takes:

| Name    | Type           | Default             | Meaning                                                                                                            |
| ------- | -------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `name`  | `string`       | none, required      | The label shown in the list.                                                                                       |
| `ip`    | `string`       | none, required      | The address the game connects to, with a port if it is not the default.                                            |
| `rules` | `RulesetInput` | none: always listed | When the entry applies. Accepts the same shorthand as any rule, such as `'allow.os.linux'`. See the warning below. |

The second argument takes:

| Name   | Type     | Default                           | Meaning                    |
| ------ | -------- | --------------------------------- | -------------------------- |
| `path` | `string` | `'${game_directory}/servers.dat'` | Where the file is written. |

::: warning Entries with `rules` are not all kept yet
Entries are grouped by ruleset, and each group is written to its own
`servers.dat`, gated by that ruleset. Entries with no rules are a group of
their own. All the files are artifacts at the same path. The manifest keeps one
artifact per path, so when your list has more than one ruleset, only the file
of the ruleset whose first entry comes last in the list is kept. The other
entries are dropped. The only sign is the build log's count of deduplicated
artifacts, such as `(1 deduped)`.

Until this is fixed, give every entry the same rules, or none. A list with no
`rules` at all is unaffected.
:::

## What it contributes

- **One blob artifact** for each ruleset in the list, at `path`: the file's
  bytes are in the bundle, not fetched from anywhere. The bytes are an
  uncompressed NBT document, the format `servers.dat` uses, with one `name`
  and `ip` per entry.
- **One blob** holding those bytes, for each of those artifacts.
- **No launch pieces.** The plugin adds nothing to the command line or to
  `vars`.

An empty list still writes a file, with no servers in it. That replaces
whatever list the player had, which is what passing no entries means.

The file is an artifact like any other, and an install checks it against the
manifest's hash like any other file. A list the player has changed, for example
by adding a server in the game, no longer matches, so it is put back to yours
the next time the game is installed or launched.

## Example

This config builds without any secret. It lists two servers, with no rules.

<<< @/examples/plugin-extras-serverlist/opys.config.mjs

The list is the only part that changes between packs. Each server appears in
the multiplayer screen under its `name`, and the game connects to its `ip`.

## Related

- [Mods and files](/guide/mods) covers other files that a manifest places.
- [All plugins](./) lists every plugin and its package.
