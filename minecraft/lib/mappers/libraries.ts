import type { Artifact } from '@lanka/core';
import { sourceUrl, extractDump } from '@lanka/core';
import type { Library } from '@lanka/mojang';

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

  return {
    path,
    source: sourceUrl(lib.artifact.url),
    size: lib.artifact.size,
    rules: lib.rules,
    integrity: { sha1: lib.artifact.sha1 },
    extract,
  };
}

export function mapLibraries(libs: readonly Library[]): Artifact[] {
  return libs.map((l) => libraryToArtifact(l));
}
