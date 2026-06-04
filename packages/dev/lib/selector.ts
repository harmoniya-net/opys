import { type Artifact, globToRegex, parseShortRuleset } from '@opys/core';

/**
 * Targets a subset of artifacts for a {@link ChainablePlugin} method:
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

/** A ruleset in any form `parseShortRuleset` accepts (shorthand or full). */
export type RulesetInput = Parameters<typeof parseShortRuleset>[0];
