# @opys/java

JDK runtime support for opys — auto-installs a JDK (Temurin, Zulu, or GraalVM CE) and exposes `${java_home}` and `${java_bin}` as standardized vars so loader templates can reference a portable Java binary.

Resolution lives in the `opys-java` crate and reaches JS through `@opys/java-binding`; this package is the typed surface over it, plus the `java()` plugin closure the build engine calls. A native builder embedding the crate gets the same resolvers and the same contribution.

## Install

```sh
npm install @opys/java
```

## Usage

```ts
import { resolveJava } from '@opys/java';
import { resolveLwjgl3ify } from '@opys/lwjgl3ify';

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

### Vendors

```ts
resolveJava({ version: '21' }); // Temurin (default)
resolveJava({ version: '21', vendor: 'zulu' }); // Azul Zulu
resolveJava({ version: '21', vendor: 'graalvm' }); // GraalVM Community Edition
```

Each vendor has its own resolver (`resolveTemurin`, `resolveZulu`, `resolveGraalvm`) exported directly, if you need release metadata without the rest of the plugin machinery.

### Version input

- **Major** — `'21'`, `'17'` — resolves to the latest GA release for that major.
- **Full version** — vendor-specific exact build:
  - `temurin`: exact Adoptium release name, e.g. `'21.0.11+10'` (`jdk-` prefix and `-LTS` suffix are tolerated).
  - `zulu`: exact `java_version`, e.g. `'21.0.12'`.
  - `graalvm`: exact GitHub release tag, e.g. `'21.0.2'` (auto-prefixed to `jdk-21.0.2`) — only the standard `jdk-<major>.<minor>.<patch>` release cadence is supported, not the newer `graal-<version>` "Innovation" cadence.

### Options

```ts
resolveJava({
  version: string,
  vendor?: 'temurin' | 'zulu' | 'graalvm', // defaults to 'temurin'
  platforms?: Platform[],                  // override the default OS/arch matrix
  apiBase?: string,                        // API base URL override — an Adoptium/Azul mirror, or a GitHub Enterprise host
  token?: string,                          // GitHub token for higher rate limits — graalvm only
});
```

## How it works

1. Resolves the requested `version` against the chosen vendor's API — Adoptium (`api.adoptium.net`) for `temurin`, Azul's Metadata API (`api.azul.com`) for `zulu`, or the `graalvm/graalvm-ce-builds` GitHub releases for `graalvm`.
2. Queries each platform (linux/osx/windows × x86_64+aarch64) in parallel; soft-skips combinations that don't ship a binary. GraalVM CE needs a single request for all of them, since one GitHub release carries every platform's asset. `temurin` and `zulu` additionally anchor every platform on the release version most of them agree on, since each platform is queried independently and can resolve to a different latest patch if a build hasn't rolled out everywhere yet.
3. Emits one `Artifact` per platform pointing at the vendor's hosted release asset, with a sha256 checksum and OS+arch rules so only the matching binary downloads at install time. When a vendor can't provide a checksum up front (older GraalVM CE releases predate GitHub's inline asset digest), the artifact instead carries an install-time `discovery` hint pointing at the vendor's sibling checksum file — never shipped unverified.
4. Each artifact extracts into `${root}/runtimes/jdk-<major>/` with its own top-level directory stripped, whatever it's named — some vendors' archives embed a build identifier that isn't knowable at resolve time (GraalVM CE's do), so every vendor extracts the same flattened way rather than special-casing the ones whose directory name happens to be predictable.
5. Sets `java_home` (per OS — macOS gets the `/Contents/Home` suffix) and `java_bin` (`${java_home}/bin/java` on POSIX; on Windows `${java_home}/bin/javaw.exe` by default — no console window — switching to `java.exe` when the `java_console` feature is enabled, e.g. `opys launch --feature java_console`).

`@opys/installer` extracts both `.zip` (Windows) and `.tar.gz` / `.tgz` (Linux/macOS) archives, preserving the executable bit on tar entries so `bin/java` stays runnable without a chmod step.

## Standard `${java_home}` and `${java_bin}` vars

Every opys template returned by `@opys/minecraft` (and by any loader built on it) now sets `launch.command = '${java_bin}'`, with `java_bin` defaulting to the literal `'java'` (PATH lookup). When you spread `@opys/java`'s vars over the loader's, the var resolves to the auto-installed JDK instead — without any change to the launch command.

## Notes

- **Vendors**: `temurin` (Eclipse Adoptium), `zulu` (Azul), `graalvm` (GraalVM Community Edition). Adding another (e.g. Liberica) is a matter of plugging in another resolver that returns a `VendorRelease`.
- **macOS app bundles**: every supported vendor's macOS archive ships as a `.jdk`-style bundle with a `Contents/MacOS`/`Contents/_CodeSignature`/… layout. `${java_home}` includes the `/Contents/Home` suffix automatically.
- **Disk usage**: each JDK is ~200 MB compressed, ~500 MB extracted. The archive is downloaded into `${root}/runtimes/` as a sibling of the `jdk-<major>/` extract target — delete the leftover `.tar.gz`/`.zip` archive there to reclaim space.
