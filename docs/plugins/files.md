# Local files

The `files` plugin, from `@opys/dev`.

A folder on your disk, installed as it is.

```js
files({ from: 'config', to: (file) => '${game_directory}/config/' + file.rel });
```

## Options

| Option | What it does                                    |
| ------ | ----------------------------------------------- |
| `from` | The folder, relative to the config file.        |
| `to`   | Where each file goes.                           |
| `url`  | Where each file is hosted. Optional. See below. |
| `hash` | With `url`: `'sha1'` (default) or `'sha256'`.   |

Every file under `from` is taken, subfolders included.

### to

Called once per file. Returns where that file is installed.

| `file.`    | Is                                           |
| ---------- | -------------------------------------------- |
| `rel`      | The path inside `from`: `jei/settings.toml`. |
| `filename` | Just the name: `settings.toml`.              |
| `dir`      | Just the folder: `jei`.                      |
| `abs`      | The full path on your machine.               |
| `size`     | Size in bytes.                               |

Start the path with a variable such as `${game_directory}`. It is filled
in on the player's machine.

## What it adds

| Kind        | What                                            |
| ----------- | ----------------------------------------------- |
| Files       | One per file in the folder. Carried, or hosted. |
| Launch      | None.                                           |
| Variables   | None.                                           |
| Environment | None.                                           |

Each one below: what it is, and how it ends up in the
[manifest](/format/).

### Files · carried (no `url`)

Each file becomes a **blob**: it travels inside the bundle, named by its
sha256. Nothing to host.

<!-- prettier-ignore -->
```js{6-9}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
    files({
      from: 'config',
      to: (file) => '${game_directory}/config/' + file.rel,
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
  "path": "${game_directory}/config/settings.txt",
  "source": { "blob": "ce197604769b1b0722bf112fe55718fa0f27ca5f02cef058be2e13a641ac38ed" },
  "size": 35
}
```

**Why this is the default:** nothing can go missing later. An upload you
forgot cannot break a pack.

### Files · hosted (with `url`)

Each file becomes a **download** from your address, pinned by its hash.
The bundle holds a pointer, and you upload the files.

<!-- prettier-ignore -->
```js{6-10}
// opys.config.mjs
export default defineConfig({
  plugins: [
    forge({ version: '1.20.1' }),
    java({ version: '17' }),
    files({
      from: 'mods',
      to: (file) => '${game_directory}/mods/' + file.rel,
      url: (file) => 'https://cdn.example.com/mods/' + file.rel,
    }),
  ],
  manifest: {
    command: '@forge.command',
    args: ['@forge.jvmArgs', '@forge.mainClass', '@forge.gameArgs'],
    workdir: '${game_directory}',
  },
});
```

<!-- prettier-ignore -->
```jsonc
// in the manifest
{
  "path": "${game_directory}/mods/my-mod.jar",
  "source": { "url": "https://cdn.example.com/mods/my-mod.jar" },
  "size": 48213,
  "integrity": { "sha1": "…" }
}
```

**When:** the files are large. See
[carried or hosted](/basics/bundle#where-your-own-files-go).

No launch pieces and no variables.

## Good to know

- Symbolic links are not followed.
- Filter with `.exclude('**/*.bak')`. See
  [Adjusting a plugin](/basics/config#adjusting-a-plugin).
- Everything in the folder ends up readable by anyone with the bundle. Keep
  secrets out of it.
