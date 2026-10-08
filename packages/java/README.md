# @opys/java

`java()` provides a Java runtime for every platform, so the game runs on the
JDK opys installs and not on whatever the launching machine has. The JDK comes
from Eclipse Temurin unless you choose Azul Zulu or GraalVM Community Edition
with `vendor`.

```sh
npm install -D @opys/dev @opys/java @opys/minecraft-vanilla
```

```js
import { defineConfig } from '@opys/dev';
import { java } from '@opys/java';
import { minecraft } from '@opys/minecraft-vanilla';

export default defineConfig({
  output: 'game.opys',
  plugins: [minecraft('1.21.1'), java('21')],
  manifest: {
    command: ({ java }) => java.bin,
    args: ({ minecraft }) => [
      minecraft.jvmArgs,
      minecraft.mainClass,
      minecraft.gameArgs,
    ],
    workdir: '${game_directory}',
  },
});
```

- The version is the first argument, a string. `java({ version: '17' })`
  throws a `TypeError`. A major takes the latest release; an exact build is
  spelled the way the vendor spells it, so check the `[java]` line the build
  prints.
- The plugin owns `java_runtime_dir`, `java_home` and `java_bin`, the launch
  group `java.bin`, and `JAVA_HOME` in the manifest's environment.
- Each archive is pinned by sha256, or the build fails. A platform the vendor
  does not ship is left out, and a machine on it gets no JDK.
- Launching needs `username`, `uuid` and `token`, from `runClient` or `--var`.

## Documentation

- https://harmoniya-net.github.io/opys/plugins/java
- https://harmoniya-net.github.io/opys/guide/java
