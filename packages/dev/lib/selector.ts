import { globToRegex, parseShortRuleset } from '@opys/core';
import type { BuildArtifact } from './plugin';

/**
 * Targets a subset of artifacts for a {@link ChainablePlugin} method:
 *
 * - `string` / `string[]` — glob(s) matched against `artifact.path`
 *   (multiple = OR).
 * - predicate — `(a) => boolean`, the escape hatch for matching on source
 *   kind, size, metadata, …
 */
export type Selector =
  string | string[] | ((artifact: BuildArtifact) => boolean);

export function matchesSelector(
  selector: Selector,
  artifact: BuildArtifact,
): boolean {
  if (typeof selector === 'function') return selector(artifact);
  const globs = (Array.isArray(selector) ? selector : [selector]).map(
    globToRegex,
  );
  return globs.some((re) => re.test(artifact.path));
}

/** A ruleset in any form `parseShortRuleset` accepts (shorthand or full). */
export type RulesetInput = Parameters<typeof parseShortRuleset>[0];
