# @torba/forge

Template builder for Forge mod loader. Merges Forge's version JSON with the vanilla Minecraft client to produce a `ForgeTemplate` containing artifacts, vars, and a launch command.

## Install

```sh
npm install @torba/forge @torba/core zod
```

## Usage

```ts
import { forge } from '@torba/forge';

const template = await forge({
  version: '1.20.1', // Minecraft version
  manifest: './forge.json', // Path to the Forge version JSON on disk
});

template.artifacts; // Vanilla MC artifacts (Artifact[])
template.vars; // Merged ValDefs (vanilla + Forge classpath)
template.command; // Launch config using Forge's main class
```

The returned `artifacts` cover only vanilla Minecraft JARs. Forge library JARs are expected to be provided separately (e.g. via `artifactScanner` from `@torba/minecraft` pointed at your local Forge installation).

## How it works

1. Fetches the vanilla `Client` for the given Minecraft version via `@torba/minecraft`.
2. Reads and parses the Forge version JSON from disk.
3. Merges JVM/game arguments, excluding jars already on Forge's module path (`-p`) from the classpath to avoid JVM module-system conflicts.
4. Rebuilds the classpath vars and replaces the vanilla main class with Forge's.

## Notes

- Forge version JSONs use relative `../libraries/` paths. These are rewritten to `${library_directory}/` automatically.
- Pass the resulting `template.vars` and `template.command` directly to your Manifest manifest.
