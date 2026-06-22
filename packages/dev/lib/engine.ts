import {
  type Manifest,
  type Artifact,
  type Launch,
  type ValDefs,
  type Val,
  type Valset,
  deduplicateArtifacts,
} from '@opys/core';
import type { OpysConfig, ArgItem, PluginMap } from './config';
import type { BuildContext } from './plugin';

/** Flatten author-ordered launch groups into a single `Valset`. */
function flattenArgs(items: ReadonlyArray<ArgItem>): Valset {
  const out: Val[] = [];
  for (const item of items) {
    if (typeof item === 'string') out.push({ rules: [], value: [item] });
    else if (Array.isArray(item)) out.push(...item);
    else out.push(item);
  }
  return out;
}

/**
 * Run every plugin's `build` hook in parallel, merge the contributions, and
 * assemble the final `Manifest`.
 */
export async function buildManifest(
  config: OpysConfig,
  ctx: BuildContext,
): Promise<Manifest> {
  ctx.log('opys', `resolving ${config.plugins.length} plugin(s)`);
  const results = await Promise.all(
    config.plugins.map(async (p) => ({
      name: p.name,
      contribution: await p.build(ctx),
    })),
  );

  // Artifacts: plugin output in list order, then literal manifest.artifacts.
  const artifacts: Artifact[] = [];
  for (const r of results) {
    if (r.contribution.artifacts) artifacts.push(...r.contribution.artifacts);
  }
  if (config.manifest.artifacts) artifacts.push(...config.manifest.artifacts);
  const deduped = deduplicateArtifacts(artifacts);

  // Vars: merge plugin vars (list order, last wins); warn on collisions.
  const vars: Record<string, ValDefs[string]> = {};
  const owner: Record<string, string> = {};
  for (const r of results) {
    if (!r.contribution.vars) continue;
    for (const [key, value] of Object.entries(r.contribution.vars)) {
      const prev = owner[key];
      if (prev !== undefined && prev !== r.name) {
        ctx.log(
          'opys',
          `warning: var '${key}' set by both '${prev}' and '${r.name}' — using '${r.name}'`,
        );
      }
      vars[key] = value;
      owner[key] = r.name;
    }
  }
  // Config `vars` is the sanctioned override layer (silent).
  if (config.manifest.vars) {
    for (const [key, value] of Object.entries(config.manifest.vars)) {
      vars[key] = value;
    }
  }

  // Launch: author functions over the plugin → launch-groups map.
  const pluginMap: PluginMap = Object.fromEntries(
    results.map((r) => [r.name, r.contribution.launch ?? {}]),
  );
  const m = config.manifest;

  // Envs: plugin-contributed defaults (list order, last wins; warn on
  // plugin-vs-plugin collision), then the author's `manifest.envs` as the
  // silent override layer — mirroring how vars are merged above.
  const envs: Record<string, ValDefs[string]> = {};
  const envOwner: Record<string, string> = {};
  for (const r of results) {
    if (!r.contribution.envs) continue;
    for (const [key, value] of Object.entries(r.contribution.envs)) {
      const prev = envOwner[key];
      if (prev !== undefined && prev !== r.name) {
        ctx.log(
          'opys',
          `warning: env '${key}' set by both '${prev}' and '${r.name}' — using '${r.name}'`,
        );
      }
      envs[key] = value;
      envOwner[key] = r.name;
    }
  }
  const authorEnvs =
    typeof m.envs === 'function' ? m.envs(pluginMap) : (m.envs ?? {});
  for (const [key, value] of Object.entries(authorEnvs)) envs[key] = value;

  const launch: Launch = {
    command: m.command(pluginMap),
    workdir:
      typeof m.workdir === 'function'
        ? m.workdir(pluginMap)
        : (m.workdir ?? '.'),
    args: flattenArgs(m.args(pluginMap)),
    envs,
  };

  ctx.log(
    'opys',
    `merged ${deduped.length} artifact(s) (${artifacts.length - deduped.length} deduped)`,
  );

  return {
    vars,
    launch,
    artifacts: deduped,
    ...(m.restrict && m.restrict.length > 0 ? { restrict: m.restrict } : {}),
  };
}
