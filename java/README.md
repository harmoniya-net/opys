# @torba/java

OpenJDK runtime support for torba — auto-installs an [Eclipse Temurin](https://adoptium.net) JDK and exposes `${java_home}` and `${java_bin}` as standardized vars so loader templates can reference a portable Java binary.

## Install

```sh
npm install @torba/java
```

## Usage

```ts
import { resolveJava } from '@torba/java';
import { resolveLwjgl3ify } from '@torba/lwjgl3ify';

const lw = await resolveLwjgl3ify({ version: '3.0.16' });
const jav = await resolveJava({ version: '21' });

return {
  manifest: {
    artifacts: [lw.artifacts, jav.artifacts],
    vars: { ...lw.vars, ...jav.vars },
    launch: lw.launch, // launch.command is `${java_bin}` already
  },
};
```

### Version input

- **Major** — `'21'`, `'17'` — resolves to the latest GA release for that major.
- **Full version** — `'21.0.11+10'` — exact Adoptium release name (`jdk-` prefix and `-LTS` suffix are tolerated).

### Options

```ts
resolveJava({
  version: string,
  vendor?: 'openjdk',         // only OpenJDK (Temurin) is supported today
  platforms?: JavaPlatform[], // override the default OS/arch matrix
  apiBase?: string,           // override the Adoptium API base URL
});
```

## How it works

1. Resolves the requested `version` against `https://api.adoptium.net/v3/`. Major versions hit `/feature_releases/<n>/ga` (latest GA); full versions hit `/release_name/eclipse/jdk-<v>` (exact).
2. Queries each platform (linux/osx/windows × x86_64+aarch64) in parallel; soft-skips combinations that don't ship a binary.
3. Emits one `Artifact` per platform pointing at the GitHub-hosted release asset, with sha256 from the API and OS+arch rules so only the matching binary downloads at install time.
4. Each artifact has an `extract: dump` rule pointing at `${root}/runtimes/jdk-<major>/`, so the JDK lands at `${root}/runtimes/jdk-<major>/jdk-<full>/`.
5. Sets `java_home` (per OS — macOS gets the `/Contents/Home` suffix) and `java_bin` (`${java_home}/bin/java` on POSIX, `${java_home}/bin/java.exe` on Windows).

`@torba/installer` extracts both `.zip` (Windows) and `.tar.gz` / `.tgz` (Linux/macOS) archives, preserving the executable bit on tar entries so `bin/java` stays runnable without a chmod step.

## Standard `${java_home}` and `${java_bin}` vars

Every torba template returned by `@torba/minecraft` (and by any loader built on it) now sets `launch.command = '${java_bin}'`, with `java_bin` defaulting to the literal `'java'` (PATH lookup). When you spread `@torba/java`'s vars over the loader's, the var resolves to the auto-installed JDK instead — without any change to the launch command.

## Notes

- **Vendor**: only `openjdk` (Eclipse Temurin) is supported. Adding Liberica, Zulu, GraalVM is a matter of plugging in another resolver.
- **macOS app bundles**: macOS Temurin tarballs ship as `.app` bundles with `Contents/MacOS/_CodeSignature/...`. `${java_home}` includes the `/Contents/Home` suffix automatically.
- **Disk usage**: each JDK is ~200 MB compressed, ~500 MB extracted. The archive is left in `${root}/runtimes/jdk-<major>/.cache/` after install — delete the `.cache` folder to reclaim space.
