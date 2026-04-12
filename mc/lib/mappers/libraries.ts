import type { Unifact } from '@unifest/core';
import {
  sourceUrl,
  exactSize,
  sha1Integrity,
  extractDump,
} from '@unifest/core';
import type { Library } from '@unifest/minecraft';
import { type Ruleset, parseShortRuleset } from '@unifest/rules';

export function libraryToUnifact(
  lib: Library,
  libraryDirVar = '${library_directory}',
  nativesDirVar = '${natives_directory}',
): Unifact {
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
    size: exactSize(lib.artifact.size),
    rules,
    integrity: sha1Integrity(lib.artifact.sha1),
    extract,
  };
}

export function mapLibraries(
  libs: readonly Library[],
  libraryDirVar?: string,
  nativesDirVar?: string,
): Unifact[] {
  return libs.map((l) => libraryToUnifact(l, libraryDirVar, nativesDirVar));
}
