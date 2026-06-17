import type { Artifact } from '@opys/core';
import { sourceUrl, extractDump } from '@opys/core';
import type { Library } from '@opys/mojang';

export function libraryToArtifact(lib: Library): Artifact {
  const path = `\${library_directory}/${lib.artifact.path}`;
  const extract = lib.native
    ? [
        extractDump('${natives_directory}', {
          excludes: ['META-INF/'],
          clean: true,
        }),
      ]
    : undefined;

  // Upstream version manifests occasionally ship a real `url` alongside a
  // placeholder `sha1: ""` / `size: 0` — e.g. lwjgl3ify 3.0.25's
  // `lzma:lzma:0.0.1`. An empty string is not a hash and a zero is not a jar
  // size; baking them in would hand the verifier a target it can only ever
  // fail. Emit the artifact without those probes instead (the jar still
  // downloads, just unverified) — same stance as the repo-lib path in
  // `@opys/lwjgl3ify`. `size`/`integrity` are optional on `Artifact` for
  // exactly this "no probe available" case.
  return {
    path,
    source: sourceUrl(lib.artifact.url),
    rules: lib.rules,
    extract,
    ...(lib.artifact.size > 0 ? { size: lib.artifact.size } : {}),
    ...(lib.artifact.sha1 ? { integrity: { sha1: lib.artifact.sha1 } } : {}),
  };
}

export function mapLibraries(libs: readonly Library[]): Artifact[] {
  return libs.map((l) => libraryToArtifact(l));
}
