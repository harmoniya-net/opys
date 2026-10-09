# Launch

`launch` says how to start the game once the files are in place.

```json
{
  "launch": {
    "command": "${java_bin}",
    "workdir": "${game_directory}",
    "args": [
      "-Xmx4G",
      { "rules": "allow.os.osx", "value": ["-XstartOnFirstThread"] },
      "-cp",
      "${classpath}",
      "net.minecraft.client.main.Main",
      "--username",
      "${auth_player_name}"
    ],
    "envs": { "JAVA_HOME": "${java_home}" }
  }
}
```

| Field     | Required | What it is                    |
| --------- | -------- | ----------------------------- |
| `command` | yes      | The program to run.           |
| `workdir` | yes      | The folder it runs in.        |
| `args`    | no       | Its arguments, in order.      |
| `envs`    | no       | Environment variables to add. |

Every string here may use [variables](./variables).

`launch` is optional. Without it a manifest can be installed, not started.

## In a config

You do not write `launch` itself. You write its fields under `manifest`.
Vanilla Minecraft, with every kind of entry:

<!-- prettier-ignore -->
```js{8,10-13,17-18}
// opys.config.mjs
export default defineConfig({
  plugins: [
    minecraft({ version: '1.21.1' }),
    java({ version: '21' }),
  ],
  manifest: {
    command: '@minecraft.command', // the program: what the plugin provides
    args: [
      '@minecraft.jvmArgs', // a reference: becomes the plugin's JVM arguments
      '-Xmx4G', // a plain argument: passed as written
      // a conditional argument: passed only where its rules pass
      { rules: 'allow.os.osx', value: ['-Xdock:name=My Pack'] },
      '@minecraft.mainClass',
      '@minecraft.gameArgs',
    ],
    workdir: '${game_directory}', // where the game runs
    envs: { PACK_NAME: 'my-pack' }, // an environment variable for the game
  },
});
```

`opys build` replaces each reference with real arguments. A manifest never
contains an `@` reference.

## command

The program. Usually `${java_bin}`, which the `java` plugin defines for
each OS.

It can be anything. The [`dgpuj`](/plugins/dgpuj)
plugin makes it a small launcher that then runs Java.

## workdir

The working directory of the process. Usually `${game_directory}`, because
the game writes saves and logs relative to it.

A launcher may override it.

## args

A list. Each item is one of two things.

### A plain argument

```json
"-Xmx4G"
```

Always passed.

### A conditional argument

```json
{ "rules": "allow.os.osx", "value": ["-XstartOnFirstThread"] }
```

Passed only when its [rules](./rules) pass. `value` is one string or a
list, so one condition can cover several arguments:

```json
{
  "rules": "allow.features.has_custom_resolution",
  "value": [
    "--width",
    "${resolution_width}",
    "--height",
    "${resolution_height}"
  ]
}
```

**Used for:** flags only one OS needs, and options a launcher switches on.

### How the final list is made

Walk `args` in order. Take each plain argument. Take the values of each
conditional one whose rules pass. Then substitute variables.

One item of the result is one argument of the process. Nothing is split on
spaces, so paths with spaces are safe.

## envs

Environment variables for the game. Same form as [`vars`](./variables), so
a value can differ per platform.

```json
"envs": { "JAVA_HOME": "${java_home}" }
```

They are **added** to the environment the launcher already has. Nothing is
removed.
