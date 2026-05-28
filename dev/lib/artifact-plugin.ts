import type { Contribution, OpysPlugin } from './plugin';
import { applyOverrides, type ArtifactOverride } from './overrides';

/**
 * Wraps a {@link OpysPlugin} so that the artifacts it contributes are passed
 * through an ordered list of {@link ArtifactOverride}s before being returned.
 *
 * Use this to give artifact-producing plugins (`forge`, `curseforge`, …) the
 * same filter/patch support that `artifactScanner` already has natively. The
 * inner plugin's `build` runs unchanged; only `Contribution.artifacts` is
 * rewritten. Non-artifact contribution fields (`vars`, `launch`) pass through
 * untouched.
 *
 * @param plugin   The inner plugin to wrap.
 * @param overrides Overrides applied to the inner plugin's artifacts. An empty
 *                  list is a no-op (artifacts pass through unchanged).
 */
export function defineArtifactPlugin(
  plugin: OpysPlugin,
  overrides: readonly ArtifactOverride[],
): OpysPlugin {
  return {
    name: plugin.name,
    async build(ctx) {
      const contribution: Contribution = await plugin.build(ctx);
      if (contribution.artifacts === undefined) return contribution;
      return {
        ...contribution,
        artifacts: applyOverrides(contribution.artifacts, overrides),
      };
    },
  };
}
