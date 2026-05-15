# @torba/forge

Forge support for torba. Resolves a Forge build via the fuckforge index, emits all artifacts needed to run vanilla MC + Forge, and produces a launch command sized for the Forge era of the requested build.

No Mojang-controlled bytes are redistributed: vanilla artifacts come from Mojang URLs (via `@torba/minecraft`), Forge artifacts come from Forge's maven, and any patched outputs (processor era only) are produced on the user's machine by ForgeWrapper running Forge's own install processors.

## Supported Forge eras

| Era         | Minecraft range | Status       | Notes                                                          |
| ----------- | --------------- | ------------ | -------------------------------------------------------------- |
| `processor` | 1.13+           | ✅ supported | Uses ForgeWrapper to run install processors on first launch    |
| `legacy`    | 1.7 – 1.12      | ✅ supported | Just downloads libraries; no patching, no ForgeWrapper         |
| `jarmod`    | 1.5 – 1.6       | ❌ not yet   | Needs jar-merging primitive (universal jar merged into client) |
| `ancient`   | pre-1.5         | ❌ not yet   | Same merging primitive + no library system                     |

Requesting a `jarmod` or `ancient` build throws a clear error.

## Install

```sh
npm install @torba/forge @torba/minecraft @torba/core zod
```

## Usage

```ts
import { resolveForge } from '@torba/forge';

const fr = await resolveForge({ version: '1.20.1' });

fr.artifacts; // Vanilla MC + Forge libs + installer + ForgeWrapper
fr.vars; // Vars including merged classpath
fr.launch; // Assembled Launch using ForgeWrapper as the JVM main class
fr.jvmArgs; // JVM args alone (Valset)
fr.mainClass; // ForgeWrapper main class wrapped as a Val
fr.gameArgs; // Game args alone (Valset)
```

### Version input

The `version` field accepts:

- **Bare MC version** — `'1.20.1'` resolves to that MC's `best` Forge build (recommended ?? latest).
- **Alias** — `'1.20.1-latest'`, `'1.20.1-recommended'`, `'1.20.1-best'`.
- **Full Forge build ID** — `'1.20.1-47.4.20'`.

### Options

```ts
resolveForge({
  version: string,
  source?: string,            // default: 'https://fuckforge.harmoniya.net'
  forgeWrapper?: {
    url?: string,             // default: ForgeWrapper 1.6.0 from GitHub releases
    sha1?: string,
    size?: number,
    path?: string,            // override destination under ${library_directory}
  },
});
```

## How it works

1. Resolves the `version` against `${source}/versions.json` and fetches the per-build entry.
2. Fetches the per-build **recipe** and branches on `recipe.type`.
3. Fetches the vanilla MC client via `@torba/minecraft`.

### Processor era (1.13+)

4. Fetches the installer's `install_profile.json` (via fuckforge's `installProfile` URL) — the canonical full library list, which includes fml\*/forge:universal jars that BootstrapLauncher loads dynamically via `-DlibraryDirectory` (not on the launch classpath).
5. Merges JVM/game args (Forge's are appended to vanilla's), excluding jars on Forge's module path (`-p`) from the classpath.
6. Emits artifacts for vanilla MC, the union of recipe runtime libs + install_profile libs, the Forge installer JAR, and ForgeWrapper. Recipe libs determine the classpath; install_profile libs ensure all required jars exist on disk.
7. Sets the launch `mainClass` to `io.github.zekerzhayard.forgewrapper.installer.Main` and adds `-Dforgewrapper.{installer,minecraft,librariesDir}` system properties. ForgeWrapper runs the installer's processor chain on first launch and chains through to Forge's real main class in the same JVM.

### Legacy era (1.7–1.12)

4. Reads `mainClass` and `minecraftArguments` from the recipe (these **replace** vanilla's args, not append).
5. Emits artifacts for vanilla MC and Forge runtime libraries. The Forge universal jar's slot in the recipe is a placeholder (no URL, no hash); the real URL and md5 live on the per-build entry's `files.universal`, and `resolveForge()` splices both onto that entry so it downloads with a real integrity check. Other recipe libraries already carry full sha1+size.
6. Builds the classpath as `client.jar + all libraries` and sets the launch `mainClass` to `net.minecraft.launchwrapper.Launch`. No installer, no ForgeWrapper, no module-path filtering.

## Notes

- ForgeWrapper materializes processor outputs (slim/extra/srg/patched jars) on disk the first time the game launches. Subsequent launches detect the outputs and skip processor execution. (Processor era only.)
- The Forge installer JAR is verified by md5 (the only digest fuckforge exposes for it). `@torba/core`'s integrity model accepts `sha1`, `sha256`, or `md5`.
- `${source}` is configurable, so you can point at a private fuckforge mirror.
- The `forgeWrapper` option only applies to processor-era builds; it's ignored for legacy.
