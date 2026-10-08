import { resolve } from 'node:path';
import { readBundleHead, type Launch, type Manifest } from '@opys/core';
import { buildManifest, type BuildContext } from '@opys/dev';
import type { ManifestSource } from '@opys/runtime';
import { parseArgs } from './args';
import { UsageError } from './errors';
import { loadConfig } from './load-config';
import type { Logger } from './logger';

export interface Prepared {
  /** What `@opys/runtime` installs and launches from. */
  source: ManifestSource;
  /** The manifest's launch block, read without its artifact list. */
  launch: Launch | undefined;
  features: string[];
  /** `--var` overrides, layered over the manifest's own vars. */
  vars: Record<string, string>;
}

/** `--var root=/srv/game` → `{ root: '/srv/game' }`. */
function parseVars(pairs: string[]): Record<string, string> {
  return Object.fromEntries(
    pairs.map((pair) => {
      const at = pair.indexOf('=');
      if (at < 1) {
        throw new UsageError(`--var takes key=value, got '${pair}'`);
      }
      return [pair.slice(0, at), pair.slice(at + 1)];
    }),
  );
}

/**
 * What `launch` and `install` both do before they differ: turn the command
 * line into something to install from.
 *
 * There are two ways in. With no argument, the config file is built in
 * memory and handed over as it is — the manifest, and its blobs still where
 * they are on this machine, with no bundle written in between. With a path,
 * that bundle is what gets installed, exactly as a deployed launcher would
 * install it: no config, no `dev`, and so no `run` either, which is
 * what `--var` is for.
 */
export async function prepare(
  argv: string[],
  logger: Logger,
  command: string,
  extraFlags: Parameters<typeof parseArgs>[1] = [],
): Promise<Prepared> {
  const args = parseArgs(argv, [
    { long: 'input', short: 'i', type: 'string' },
    { long: 'mode', type: 'string' },
    { long: 'feature', type: 'string' },
    { long: 'var', type: 'strings' },
    ...extraFlags,
  ]);
  // Runtime features gate rule-tagged vars/artifacts at install + launch — e.g.
  // `--feature java_console` flips Windows `java_bin` from javaw.exe to java.exe.
  // Comma-separated so a single flag can carry several: `--feature a,b`.
  const features = (args.getString('feature') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const vars = parseVars(args.getStrings('var'));

  const [bundle, ...rest] = args.positionals;
  if (rest.length > 0) {
    throw new UsageError(`unexpected argument '${rest[0]}'`);
  }
  if (bundle !== undefined) {
    if (args.getString('input') !== undefined) {
      throw new UsageError(
        'a bundle is installed as it is — it cannot be combined with --input',
      );
    }
    const path = resolve(bundle);
    return {
      source: { bundle: path },
      launch: readBundleHead(path).launch,
      features,
      vars,
    };
  }

  const inputFile = args.getString('input') ?? 'opys.config.mjs';
  const mode = args.getString('mode') ?? command;
  const { config, configDir } = await loadConfig(inputFile, mode);

  const ctx: BuildContext = {
    log: (scope, msg) => logger.info(`[${scope}] ${msg}`),
    configDir,
    mode,
  };
  const built = await buildManifest(config, ctx);

  // A plain `.mjs` config written for the old name would otherwise launch
  // with its machine paths and credentials quietly left out.
  if ('runClient' in config)
    throw new Error('`runClient` is now `run`: rename the key');

  // `run` is the launch-time manifest patch: a shallow per-field override.
  const manifest: Manifest = config.run
    ? { ...built.manifest, ...config.run(built.manifest) }
    : built.manifest;

  for (const [key, val] of Object.entries(manifest.vars)) {
    if (typeof val !== 'string' && !Array.isArray(val)) {
      throw new Error(
        `var '${key}' must be a string or ConditionalVal[], got ${typeof val}`,
      );
    }
  }

  return {
    source: { manifest, blobs: built.blobs },
    launch: manifest.launch,
    features,
    vars,
  };
}
