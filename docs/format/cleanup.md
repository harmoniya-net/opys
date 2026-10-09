# Cleanup

`cleanup` is a list of rules for files that should no longer be there. It
runs last, after everything is installed and unpacked.

```json
{
  "cleanup": [
    { "includes": ["${game_directory}/mods/*.jar"] },
    {
      "includes": ["${game_directory}/config/**"],
      "excludes": ["**/options.txt"]
    }
  ]
}
```

**Why it exists:** an install only adds and updates. Drop a mod from a
pack, and every player who has it keeps the jar. `cleanup` is how a pack
takes things away.

## In a config

Vanilla Minecraft, removing leftover mods and configs:

<!-- prettier-ignore -->
```js{12-18}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: ['@minecraft.jvmArgs', '@minecraft.mainClass', '@minecraft.gameArgs'],
    workdir: '${game_directory}',
    cleanup: [
      // every jar in mods that this pack did not install
      { includes: ['${game_directory}/mods/*.jar'] },
      // everything under config, except any options.txt
      {
        includes: ['${game_directory}/config/**'],
        excludes: ['**/options.txt'],
      },
    ],
  },
});
```

When and why to use it: [The config](/basics/config#cleanup).

## A rule

| Field      | Required | What it is                    |
| ---------- | -------- | ----------------------------- |
| `includes` | yes      | Patterns for files to remove. |
| `excludes` | no       | Patterns for files to spare.  |

A file is removed when all three hold:

1. It matches one of `includes`.
2. It matches none of `excludes`.
3. **This manifest did not install it.**

The third is not optional and cannot be switched off. So
`mods/*.jar` means "every jar in `mods` that is not part of this pack".

"Installed" includes files unpacked from an archive.

## Patterns

Patterns match whole paths, after [variables](./variables) are filled in.

| Pattern | Matches                        |
| ------- | ------------------------------ |
| `*`     | Anything within one folder.    |
| `?`     | One character within a folder. |
| `**`    | Anything, across folders.      |
| `{a,b}` | Either `a` or `b`.             |

```text
${game_directory}/mods/*.jar          jars directly in mods
${game_directory}/mods/**/*.jar       jars in mods and its subfolders
${game_directory}/logs/**             everything under logs
${game_directory}/{logs,crash-reports}/**
```

An `excludes` pattern that is not a full path matches at any depth:
`*.bak` spares every `.bak` file.

Paths are compared as paths. `a//b`, `a/./b` and `a/b` are the same file. On
Windows, case is ignored and `\` is read as `/`.

## Folders

A folder is removed when cleanup leaves it empty. So `logs/**` removes
`logs` itself, and `mods/*.jar` removes `mods` only if it took the last
file.

A folder that was already empty, and that no rule names, is left alone.

## What is refused

Every rule is checked **before anything is downloaded**. The whole install
stops if an `includes` pattern, after substitution:

| Problem                                 | Example          |
| --------------------------------------- | ---------------- |
| Still contains `${`                     | `${typo}/mods/*` |
| Is not an absolute path                 | `mods/*.jar`     |
| Contains `..`                           | `${root}/../*`   |
| Has no folder before its first wildcard | `/*`, `C:/*`     |

**Why so strict:** each of these is a rule that could delete far more than
its author meant. An empty variable turns `${root}/mods/*` into `/mods/*`.

## Only the author writes these

A plugin cannot contribute a cleanup rule. Something that deletes files is
not a thing to receive from a dependency.
