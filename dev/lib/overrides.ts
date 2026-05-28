import {
  type Artifact,
  type Ruleset,
  globToRegex,
  parseShortRuleset,
} from '@opys/core';

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

/** A ruleset in any form `parseShortRuleset` accepts (shorthand or full). */
export type RulesetInput = Parameters<typeof parseShortRuleset>[0];

/**
 * A per-selector patch over the artifacts a plugin produces. Each entry
 * names the files it `match`es and the changes to apply — drop them,
 * attach a ruleset, or clear integrity. Overrides run in list order; a
 * later entry sees the effect of an earlier one.
 */
export interface ArtifactOverride {
  /** Files this override applies to. */
  match: Selector;
  /** Drop matched artifacts entirely. */
  exclude?: boolean;
  /**
   * Ruleset to attach to matched artifacts — shorthand (`'allow.os.osx'`)
   * or a full `Ruleset`. Appended to each artifact's existing `rules`.
   */
  rules?: RulesetInput;
  /** `null` clears `integrity` + `discovery` (skip verification). */
  integrity?: null;
}

/** Apply an ordered list of {@link ArtifactOverride}s to a list of artifacts. */
export function applyOverrides(
  artifacts: readonly Artifact[],
  overrides: readonly ArtifactOverride[],
): Artifact[] {
  if (overrides.length === 0) return [...artifacts];
  const out: Artifact[] = [];
  for (const artifact of artifacts) {
    let current: Artifact | null = artifact;
    for (const override of overrides) {
      if (current === null) break;
      if (!matchesSelector(override.match, current)) continue;
      if (override.exclude) {
        current = null;
        break;
      }
      if (override.rules !== undefined) {
        const extra: Ruleset = parseShortRuleset(override.rules);
        current = { ...current, rules: [...current.rules, ...extra] };
      }
      if (override.integrity === null) {
        current = { ...current, integrity: undefined, discovery: undefined };
      }
    }
    if (current !== null) out.push(current);
  }
  return out;
}
