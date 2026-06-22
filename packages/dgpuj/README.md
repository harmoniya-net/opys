# @opys/dgpuj

Provision the [`dgpuj`](https://github.com/harmoniya-net/dgpuj) launcher as an
opys plugin. `dgpuj` forces the **discrete GPU** on hybrid-graphics systems and
runs the JVM in-process, so it drops in as the launch `command` on every
platform — forcing the dGPU on Windows/Linux and acting as a harmless
passthrough on macOS.

## Why

GPU selection is decided per-process for the process that creates the GL
context, with no inheritance — so a launcher that merely _spawns_ `javaw` can't
force it (the child is a different process). `dgpuj` applies the per-OS hint to
itself (`NvOptimusEnablement` export on Windows, NVIDIA PRIME env vars on Linux)
and hosts the JVM via `JNI_CreateJavaVM`. See the
[dgpuj README](https://github.com/harmoniya-net/dgpuj) for the gory details.

## Usage

Add `dgpuj()` alongside `java` and point the launch `command` at it.
`@opys/java` exports `JAVA_HOME` by default, so dgpuj finds the JVM
automatically — no extra args needed. It's re-exported from `@opys/minecraft`:

```js
import { defineConfig } from '@opys/dev';
import { forge, java, dgpuj } from '@opys/minecraft';

export default defineConfig(() => ({
  output: 'output.json',
  plugins: [forge('1.20.1-best'), java('17'), dgpuj()],
  manifest: {
    command: ({ dgpuj }) => dgpuj.bin,
    args: ({ forge }) => [forge.jvmArgs, forge.mainClass, forge.gameArgs],
    workdir: '${game_directory}',
  },
}));
```

`dgpuj.bin` is the launcher binary. If nothing exports `JAVA_HOME` (e.g. you
don't use `@opys/java`), tell dgpuj where the JVM is — prepend the `home` launch
group (`args: ({ dgpuj, forge }) => [dgpuj.home, …]`, which expands to
`--dgpuj-home ${java_home}`), or set `JAVA_HOME` / pass `--dgpuj-jvm <path>`
yourself.

## API

### `dgpuj(options?)`

Returns a `ChainablePlugin` named `dgpuj`.

| option      | default                 | meaning                                                                     |
| ----------- | ----------------------- | --------------------------------------------------------------------------- |
| `version`   | `'latest'`              | Release selector: `'latest'`, `'prerelease'`, or an exact tag (`'v0.3.0'`). |
| `platforms` | all 5 targets           | Override the platform set (`DEFAULT_PLATFORMS`).                            |
| `repo`      | `'harmoniya-net/dgpuj'` | Source `owner/name`.                                                        |
| `token`     | —                       | GitHub token to raise API rate limits.                                      |

**Owns** the `dgpuj_dir` (default `${root}/dgpuj`) and per-OS `dgpuj_bin` vars.
**Exposes** the `bin` and `home` launch groups.

Each target's release archive (`.tar.gz`/`.zip`) is emitted as its own
OS+arch-scoped artifact that extracts the single binary — so only the archive
matching the launch platform downloads, and the tarball preserves the +x bit.

## License

MIT
