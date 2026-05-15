# @torba/cleanroom

[Cleanroom Loader](https://cleanroommc.com/) support for torba. Resolves a Cleanroom release on GitHub, fetches the installer JAR, reads its bundled `version.json` + `install_profile.json`, and emits all artifacts needed to run vanilla 1.12.2 + Cleanroom.

No Mojang-controlled bytes are redistributed: vanilla artifacts come from Mojang URLs (via `@torba/minecraft`), Cleanroom's bundled bootstrap jar is materialized on the user's machine by extracting the `maven/` tree from the installer.

## Install

```sh
npm install @torba/cleanroom @torba/minecraft @torba/core zod
```

## Usage

```ts
import { resolveCleanroom } from '@torba/cleanroom';

const cr = await resolveCleanroom({ version: '0.5.9-alpha' });

cr.artifacts; // Vanilla MC + Cleanroom installer + bundled cleanroom jar + runtime libs
cr.vars; // Vars including merged classpath
cr.launch; // Assembled Launch using Foundation as the JVM main class
cr.jvmArgs; // JVM args alone (Valset)
cr.mainClass; // Foundation main class wrapped as a Val
cr.gameArgs; // Game args alone (Valset)
```

### Version input

The `version` field accepts:

- **Exact release tag** — `'0.5.9-alpha'`.
- **`'latest'`** — newest non-prerelease GitHub release. (Cleanroom is currently alpha-only, so this throws today; pin a tag or use `'prerelease'`.)
- **`'prerelease'`** — newest GitHub release including prereleases.

### Options

```ts
resolveCleanroom({
  version: string,
  repo?: string,    // default: 'CleanroomMC/Cleanroom'
  token?: string,   // optional GitHub token for higher rate limits
});
```

## How it works

1. Resolves the requested `version` against `https://api.github.com/repos/<repo>/releases` and picks the matching release's `*-installer.jar` asset.
2. Downloads the installer JAR once and reads `version.json` + `install_profile.json` directly out of it (no upstream metadata service needed).
3. Fetches the vanilla MC client for `version.json.inheritsFrom` (typically `1.12.2`) via `@torba/minecraft`.
4. Emits artifacts for:
   - vanilla MC (client.jar, libraries, asset index, assets, natives)
   - the Cleanroom installer JAR with an `extract: scan('maven/', ...)` rule so the bundled `cleanroom-<v>.jar` lands at the correct library path on first launch
   - the runtime libraries listed in the installer's `version.json` (the `com.cleanroommc:cleanroom:<v>` entry has `url: ""` and is sourced from the `maven/` extract instead of being downloaded)
   - install-time libraries from `install_profile.json` (e.g. `mcp_config`)
5. Builds the launch classpath as `client.jar + vanilla libs + Cleanroom runtime libs`, sets the launch `mainClass` to `top.outlands.foundation.boot.Foundation`, and uses Cleanroom's legacy `minecraftArguments` as the game args (replacing vanilla's, per the Mojang launcher's `inheritsFrom` semantics).

## Notes

- **Java 25 is required** — torba does not manage JVMs, so configure your launch's `command` (e.g. `launch: { ...cr.launch, command: '/path/to/java25/javaw' }`) accordingly.
- Cleanroom has no install processors, no ForgeWrapper-equivalent, and no jar-merging step. The `Foundation` main class does its own bootstrap at runtime.
- The installer JAR is downloaded twice per session: once at template-build time to read its bundled JSONs, once at install time as a normal artifact. It's only ~5 MB.
- The installer's GitHub asset URL is direct — no rate limits beyond GitHub's normal CDN behavior. The release-listing API call respects `options.token` if you need authenticated rate limits.
