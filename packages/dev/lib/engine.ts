import type { Blobs, Manifest } from '@opys/core';
import * as napi from '@opys/dev-binding';
import type { OpysConfig, PluginMap } from './config';
import type { BuildContext } from './plugin';

/** What the binding hands back — see `opys-dev`'s `Assembled`. */
interface Assembled extends Built {
  warnings: string[];
}

/**
 * A build's result: the manifest, and where each blob it names is kept on
 * this machine. The two travel together — to `writeBundle`, which publishes
 * them as one file, or straight to `@opys/runtime`, which installs from them
 * with nothing written in between.
 */
export interface Built {
  manifest: Manifest;
  blobs: Blobs;
}

/**
 * Run every plugin's `build` hook in parallel, then let the `opys-dev` crate
 * merge the contributions into the final `Manifest`.
 *
 * The split is deliberate. Driving the plugins is host-shaped — these are JS
 * closures, as are the author's `command` / `args` / `workdir` / `envs`
 * accessors — so that half stays here. Folding the results is the same
 * operation whoever produced them, so it lives in Rust and a native builder
 * gets the identical merge without a second implementation.
 */
export async function buildManifest(
  config: OpysConfig,
  ctx: BuildContext,
): Promise<Built> {
  ctx.log('opys', `resolving ${config.plugins.length} plugin(s)`);
  const results = await Promise.all(
    config.plugins.map(async (p) => ({
      name: p.name,
      contribution: await p.build(ctx),
    })),
  );

  // Launch groups never cross the boundary: they exist only to feed the
  // author's accessors, which are closures. Only their results go over.
  const pluginMap: PluginMap = Object.fromEntries(
    results.map((r) => [r.name, r.contribution.launch ?? {}]),
  );
  const m = config.manifest;
  // A config is plain JavaScript as often as not, and an unknown key there is
  // silently dropped — which for this one would mean a pack that stops
  // removing stale mods without anybody being told.
  if ('restrict' in m)
    throw new Error(
      "`manifest.restrict` is now `manifest.cleanup`: write `cleanup: [{ includes: ['…'] }]`",
    );

  const outputs = results.map((r) => ({
    name: r.name,
    contribution: {
      artifacts: r.contribution.artifacts ?? [],
      blobs: r.contribution.blobs ?? {},
      vars: r.contribution.vars ?? {},
      envs: r.contribution.envs ?? {},
    },
  }));

  const { manifest, blobs, warnings } = napi.assemble(outputs, {
    artifacts: m.artifacts ?? [],
    vars: m.vars ?? {},
    command: m.command(pluginMap),
    // Omitted rather than passed as undefined — the manifest default (`.`)
    // is the crate's to apply, so both callers agree on one spelling.
    ...(m.workdir === undefined
      ? {}
      : {
          workdir:
            typeof m.workdir === 'function' ? m.workdir(pluginMap) : m.workdir,
        }),
    args: m.args(pluginMap),
    envs: typeof m.envs === 'function' ? m.envs(pluginMap) : (m.envs ?? {}),
    cleanup: m.cleanup ?? [],
  }) as Assembled;

  for (const warning of warnings) ctx.log('opys', warning);

  const submitted =
    outputs.reduce((n, o) => n + o.contribution.artifacts.length, 0) +
    (m.artifacts?.length ?? 0);
  ctx.log(
    'opys',
    `merged ${manifest.artifacts.length} artifact(s) (${submitted - manifest.artifacts.length} deduped)`,
  );

  return { manifest, blobs };
}
