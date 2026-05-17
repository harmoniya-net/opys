import type { Artifact } from './artifact';
import { globToRegex } from './glob';

/**
 * Targets a subset of artifacts:
 *
 * - `string` / `string[]` — glob(s) matched against `artifact.path`
 *   (multiple = OR).
 * - predicate — `(a) => boolean`, the escape hatch for matching on source
 *   kind, size, metadata, …
 */
export type Selector = string | string[] | ((artifact: Artifact) => boolean);

export function matchesSelector(
  selector: Selector,
  artifact: Artifact,
): boolean {
  if (typeof selector === 'function') return selector(artifact);
  const globs = (Array.isArray(selector) ? selector : [selector]).map(
    globToRegex,
  );
  return globs.some((re) => re.test(artifact.path));
}

/**
 * Filters every artifact-producing plugin accepts. `defineArtifactPlugin`-style
 * plugins spread this into their options; the engine / plugin applies it via
 * {@link applyFilters}.
 */
export interface ArtifactFilters {
  /** Drop every artifact the selector matches. */
  exclude?: Selector;
}

/** Apply an {@link ArtifactFilters} set to a list of artifacts. Pure. */
export function applyFilters(
  artifacts: readonly Artifact[],
  filters: ArtifactFilters,
): Artifact[] {
  let out: readonly Artifact[] = artifacts;
  if (filters.exclude !== undefined) {
    const sel = filters.exclude;
    out = out.filter((a) => !matchesSelector(sel, a));
  }
  return [...out];
}
