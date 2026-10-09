import type { Blobs } from '@opys/bundle';
import type { Manifest } from '@opys/core';
import { dev as napi } from '@opys/binding';
import type { OpysConfig } from './config';
import type { BuildContext } from './plugin';

/** What the binding hands back — see `opys-dev`'s `Assembled`. */
interface Assembled extends Built {
  warnings: string[];
}

/**
 * A build's result: the manifest, and where each blob it names is kept on
 * this machine. The two go to `writeBundle`, which makes one file of them.
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
 * closures — so that half stays here. Folding the results, and putting the
 * launch line together from what the plugins expose, is the same operation
 * whoever produced them, so it lives in Rust and a native builder gets the
 * identical merge without a second implementation.
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

  const m = config.manifest;
  // A config is plain JavaScript as often as not, and an unknown key there is
  // silently dropped — which for this one would mean a pack that stops
  // removing stale mods without anybody being told.
  if ('restrict' in m)
    throw new Error(
      "`manifest.restrict` is now `manifest.cleanup`: write `cleanup: [{ includes: ['…'] }]`",
    );

  // The same for the launch line: it was a function over the plugins, and one
  // left in place would reach the crate as nothing at all.
  for (const field of ['command', 'args', 'workdir', 'envs'] as const)
    if (typeof m[field] === 'function')
      throw new Error(
        `\`manifest.${field}\` is no longer a function: write it as data, naming what a plugin exposes as '@plugin.group' — args: ['@forge.jvmArgs', '@forge.mainClass', '@forge.gameArgs']`,
      );

  const outputs = results.map((r) => ({
    name: r.name,
    contribution: {
      // Bytes cross into the crate as base64, like everything that does.
      artifacts: (r.contribution.artifacts ?? []).map((a) =>
        'bytes' in a.source
          ? {
              ...a,
              source: { bytes: Buffer.from(a.source.bytes).toString('base64') },
            }
          : a,
      ),
      vars: r.contribution.vars ?? {},
      launch: r.contribution.launch ?? {},
      envs: r.contribution.envs ?? {},
    },
  }));

  // References are the crate's to resolve, and to refuse: one merge, and one
  // place a launch line is checked, whoever drives the plugins.
  const { manifest, blobs, warnings } = napi.assemble(outputs, {
    artifacts: m.artifacts ?? [],
    vars: m.vars ?? {},
    command: m.command,
    // Omitted rather than passed as undefined — the manifest default (`.`)
    // is the crate's to apply, so both callers agree on one spelling.
    ...(m.workdir === undefined ? {} : { workdir: m.workdir }),
    args: m.args,
    envs: m.envs ?? {},
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
