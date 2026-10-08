# @opys/dgpuj

Start the game through [dgpuj](https://github.com/harmoniya-net/dgpuj), a small launcher that asks for the discrete GPU on machines with two graphics chips. Use `dgpuj.bin` as the launch `command` in place of `java.bin`; dgpuj then starts the JVM inside its own process.

```sh
npm install -D @opys/dev @opys/minecraft @opys/dgpuj
```

```js
import { java, minecraft } from '@opys/minecraft';
import { dgpuj } from '@opys/dgpuj';

// In the config passed to defineConfig():
plugins: [minecraft('1.21.1'), java('21'), dgpuj()],
manifest: {
  command: ({ dgpuj }) => dgpuj.bin,
  args: ({ dgpuj, minecraft }) => [
    dgpuj.home,
    minecraft.jvmArgs,
    minecraft.mainClass,
    minecraft.gameArgs,
  ],
  workdir: '${game_directory}',
},
```

- It is a command and not a JVM argument because the GPU is chosen for the process that creates the graphics context. A launcher that only spawns `java` cannot choose for the child.
- `dgpuj.home` expands to `--dgpuj-home ${java_home}`, which only the `java` plugin defines. Without it, dgpuj finds the JDK through `JAVA_HOME`.
- Archives exist for Windows (`x86_64`, `aarch64`), Linux (`x86_64`) and macOS (`x86_64`, `aarch64`). There is none for Linux `aarch64`, so a launch there fails. Releases before `v0.3.0` cannot be used.
- On macOS dgpuj forces no GPU. On Linux it sets NVIDIA's render-offload variables, and only when the proprietary NVIDIA driver is present.

## Documentation

- [dgpuj plugin](https://harmoniya-net.github.io/opys/plugins/dgpuj): options, launch groups, variables, platforms
- [Accounts, servers, GPUs](https://harmoniya-net.github.io/opys/guide/extras): using the discrete GPU
