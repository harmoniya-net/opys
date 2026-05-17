import type { Artifact } from '@torba/core';
import { sourceUrl, extractDump } from '@torba/core';
import type { Library } from '@torba/mojang';
import { type Ruleset, parseShortRuleset } from '@torba/core';

export function libraryToArtifact(
  lib: Library,
  libraryDirVar = '${library_directory}',
  nativesDirVar = '${natives_directory}',
): Artifact {
  const path = `${libraryDirVar}/${lib.artifact.path}`;
  const rules: Ruleset =
    lib.rules.length > 0
      ? lib.rules.map((r) => parseShortRuleset([r])[0]!)
      : [];
  const extract = lib.native
    ? [extractDump(nativesDirVar, { excludes: ['META-INF/'], clean: true })]
    : undefined;

  return {
    path,
    source: sourceUrl(lib.artifact.url),
    size: lib.artifact.size,
    rules,
    integrity: { sha1: lib.artifact.sha1 },
    extract,
  };
}

export function mapLibraries(
  libs: readonly Library[],
  libraryDirVar?: string,
  nativesDirVar?: string,
): Artifact[] {
  return libs.map((l) => libraryToArtifact(l, libraryDirVar, nativesDirVar));
}
