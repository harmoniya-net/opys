# @torba/lwjgl3ify

[lwjgl3ify](https://github.com/GTNewHorizons/lwjgl3ify) support for torba — runs Minecraft 1.7.10 with LWJGL 3 and modern Java (17+, defaults to Java 25 per upstream).

lwjgl3ify is a compatibility layer (`RetroFuturaBootstrap` + a `forgePatches` jar that replaces Java-incompatible Forge classes) that lets old 1.7.10 modpacks run under a modern JVM with LWJGL 3 graphics.

## Install

```sh
npm install @torba/lwjgl3ify @torba/minecraft @torba/core zod
```

## Usage

```ts
import { resolveLwjgl3ify } from '@torba/lwjgl3ify';

const lw = await resolveLwjgl3ify({ version: '3.0.16' });

lw.artifacts; // 1.7.10 client + assets + libs (Mojang + Forge + lwjgl3ify + lwjgl3)
lw.vars; // Vars including merged classpath
lw.launch; // Assembled Launch using RetroFuturaBootstrap as the JVM main class
lw.jvmArgs; // JVM args alone (Valset)
lw.mainClass; // RFB main class wrapped as a Val
lw.gameArgs; // Game args alone (Valset)
```

### Version input

- **Exact tag** — `'3.0.16'`.
- **`'latest'`** — newest non-prerelease GitHub release.
- **`'prerelease'`** — newest GitHub release including prereleases.

### Options

```ts
resolveLwjgl3ify({
  version: string,
  repo?: string,    // default: 'GTNewHorizons/lwjgl3ify'
  token?: string,   // optional GitHub token for higher rate limits
});
```

## How it works

1. Resolves the requested `version` against `https://api.github.com/repos/<repo>/releases` and picks the matching release's `version.json` asset.
2. Fetches that JSON — it's a self-contained Mojang-format client manifest (`inheritsFrom: null`) that carries the vanilla 1.7.10 client URL, asset index, and the full library list inline (vanilla 1.7.10 libs + Forge 1.7.10 libs + lwjgl3ify + LWJGL 3 + native classifiers).
3. Hands the manifest to `parseClient` + `clientToTemplate` from `@torba/minecraft` for all the well-formed entries (including the LWJGL 3 native classifier libs that get extracted into `${natives_directory}`).
4. Resurrects the 15 "repo-style" library entries the strict Mojang schema drops — these have only `name` (maven coord) + `url` (maven repo base), no `downloads.artifact`. They cover: lwjgl3ify's `forgePatches`, Forge's `universal` jar, Scala/Akka runtime, `lzma`, and Guava 17. URLs are synthesized from `repo + coordPath`; sha1/size are not available upstream so these download without integrity verification (Forge maven and Mojang's libraries CDN are stable enough that this is acceptable).
5. Appends the resurrected libs onto each per-OS classpath entry from `clientToTemplate`.
6. Emits the lwjgl3ify mod jar (`lwjgl3ify-<v>.jar`) as an artifact under `${game_directory}/mods/`. RetroFuturaBootstrap's `PluginLoader` scans the mods folder at startup for RFB plugin descriptors — that's where the Pack200 redirect transformer lives, so the mod jar must be present _before_ FML loads (the `forgePatches` jar alone isn't enough). The MMC bundle leaves this to the user; this package deploys it automatically.
7. Sets `mainClass` to `com.gtnewhorizons.retrofuturabootstrap.MainStartOnFirstThread` (from the manifest) with the upstream's full `arguments.jvm` array — including `-Djava.system.class.loader=…RfbSystemClassLoader`, `--enable-native-access ALL-UNNAMED`, and a long list of `--add-opens` flags for `java.base`, `java.desktop`, `jdk.dynalink`, etc.

## Notes

- **Java 17+ is required**; upstream defaults to Java 25 for 3.x. torba does not manage JVMs, so configure your launch's `command` field (e.g. `launch: { ...lw.launch, command: '/path/to/java25/javaw' }`) accordingly.
- The resolved manifest is the same one PrismLauncher / MultiMC consume from the lwjgl3ify MMC instance zip — no custom installer or install processors are involved.
- Forge 1.7.10's universal jar is downloaded from Forge maven without sha1, since the manifest lists it in repo-style form. `@torba/installer`'s integrity step is a no-op for entries without an integrity field.
