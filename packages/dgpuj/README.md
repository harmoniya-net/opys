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

### Recommended: via `@opys/java`

If you provision the JDK with [`@opys/java`](../java), just flip the `dgpuj`
option — `java` then owns the dgpuj binary and repoints `bin` at it:

```js
import { java } from '@opys/java';

// plugins: [forge('1.20.1-best'), java('17', { dgpuj: true })]
command: ({ java }) => java.bin,                 // = dgpuj
args: ({ java, forge }) => [
  java.home,                                      // --dgpuj-home ${java_home}
  forge.jvmArgs, forge.mainClass, forge.gameArgs,
],
```

### Standalone plugin

Or add it as its own plugin (e.g. when you wire the JVM yourself):

```js
import { dgpuj } from '@opys/dgpuj';

// plugins: [forge('1.20.1-best'), java('17'), dgpuj()]
command: ({ dgpuj }) => dgpuj.bin,
args: ({ dgpuj, forge }) => [
  dgpuj.home, // --dgpuj-home ${java_home}
  forge.jvmArgs, forge.mainClass, forge.gameArgs,
],
```

`dgpuj.bin` is the launcher binary; `dgpuj.home` expands to
`--dgpuj-home ${java_home}` so it finds the JVM provisioned by `@opys/java`. If
you locate the JVM yourself, drop `dgpuj.home` and pass `--dgpuj-jvm <path>` or
set `JAVA_HOME` instead.

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
