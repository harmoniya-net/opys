# Variables

A variable is a named value. Strings in a manifest refer to it as
`${name}`, and the value is filled in on the installing machine.

```json
{
  "vars": {
    "root": ".",
    "game_directory": "${root}/",
    "library_directory": "${root}/libraries"
  }
}
```

**Why they exist:** a manifest is the same for every player, but paths and
accounts are not. The manifest names them, and each machine supplies them.

This page is the syntax. The names a Minecraft pack actually uses are on
[Variables](/plugins/minecraft#variables) in the reference.

## In a config

Vanilla Minecraft with a memory limit:

<!-- prettier-ignore -->
```js{10,17}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@minecraft.command',
    args: [
      '-Xmx${max_ram}', // used here: Java receives -Xmx4G
      '@minecraft.jvmArgs',
      '@minecraft.mainClass',
      '@minecraft.gameArgs',
    ],
    workdir: '${game_directory}',
    vars: {
      max_ram: '4G', // defined here
    },
  },
});
```

The value in the config is a default. Override it when launching, without
touching the config:

```sh
opys launch --var max_ram=8G
```

Java now receives `-Xmx8G`.

## A plain value

```json
"launcher_name": "opys"
```

The same on every machine. It may refer to other variables.

## One value per platform

```json
"java_bin": [
  { "value": "${java_home}/bin/java", "rules": "allow.os.linux" },
  { "value": "${java_home}/bin/java", "rules": "allow.os.osx" },
  { "value": "${java_home}\\bin\\javaw.exe", "rules": "allow.os.windows" }
]
```

A list of alternatives, each with [rules](./rules).

- **The last one whose rules pass wins.**
- An alternative without `rules` always passes, so put a default first.
- If none passes, the variable is not defined at all.

**Used for:** anything that differs by OS, such as the Java executable or
the classpath separator (`;` on Windows, `:` elsewhere).

## Where values come from

Three layers, later ones winning:

1. **The manifest's `vars`**, picked for this platform.
2. **`run`**, when launching from a config.
3. **The launcher's `vars`**, or `--var` on the command line.

So a manifest can give a default (`root` is `.`) and the machine replaces
it.

## Substitution

`${name}` is replaced in these places:

| Where                                 | Example                                    |
| ------------------------------------- | ------------------------------------------ |
| Artifact `path`                       | `${game_directory}/mods/jei.jar`           |
| Source `url`                          | `${mirror}/libraries/a.jar`                |
| Extract `into`                        | `${natives_directory}`                     |
| `launch.command`, `workdir`           | `${java_bin}`                              |
| Each argument, each environment value | `-Djava.library.path=${natives_directory}` |
| Cleanup patterns                      | `${game_directory}/mods/*.jar`             |
| Other variables' values               | `${root}/libraries`                        |

It is **not** replaced in blob ids, rules, or the entry patterns of
`extract`.

The rules:

- Variables may refer to each other. A cycle is an error.
- **A name nothing defines is left as written.** No error. The game then
  receives the literal text `${username}`.
- `\${` is a literal `${`.
- One argument stays one argument. A variable cannot expand into several.

::: tip The exception
In a [cleanup](./cleanup) pattern, an undefined variable _is_ an error.
Deleting from a path with a hole in it is too dangerous to allow.
:::
