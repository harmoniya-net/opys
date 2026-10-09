# Server list

The `serverlist` plugin, from `@opys/minecraft`.

Pre-fills the multiplayer server list.

```js
serverlist({
  servers: [
    { name: 'My SMP', ip: 'mc.example.com' },
    { name: 'Creative', ip: 'creative.example.com:25566' },
  ],
});
```

Players see your servers the first time they open Multiplayer.

## Options

| Option    | What it does                                                  |
| --------- | ------------------------------------------------------------- |
| `servers` | The entries, in the order the game lists them.                |
| `to`      | Where the file goes. Default `${game_directory}/servers.dat`. |

Each entry is `{ name, ip }`. It may also have `rules`.

## What it adds

| Kind        | What           |
| ----------- | -------------- |
| Files       | `servers.dat`. |
| Launch      | None.          |
| Variables   | None.          |
| Environment | None.          |

Each one below: what it is, and how it ends up in the
[manifest](/format/).

### Files · `servers.dat`

The file the game keeps its server list in. It is generated while
building and carried in the bundle as a blob. Nothing is downloaded.

<!-- prettier-ignore -->
```js{6-11}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
    serverlist({
      servers: [
        { name: 'My SMP', ip: 'mc.example.com' },
        { name: 'Friends', ip: 'friends.example.com:25566' },
      ],
    }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// in the manifest
{
  "path": "${game_directory}/servers.dat",
  "source": { "blob": "f5b3f218f52d0ab5593094a9281e8905276a3e7aa405d5b78ea410a089e21b3b" },
  "size": 105
}
```

**Why a generated file:** the game has no setting for "default servers". It
only reads this file.

No launch pieces and no variables.

## Good to know

- **It overwrites.** The file is part of the pack, so it is put back on
  every install. Servers a player adds in the game are lost at the next
  update.
- An empty list still writes a file, which clears the player's list.
- Give every entry the same `rules`, or none. Entries with different rules
  become separate files at the same path, and only one survives.
