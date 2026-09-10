import type { Manifest } from '@opys/core';
import { buildManifest, type BuildContext } from '@opys/dev';
import { parseArgs } from './args';
import { loadConfig } from './load-config';
import type { Logger } from './logger';

export interface Prepared {
  manifest: Manifest;
  features: string[];
}

/**
 * Config file to launch-ready manifest — what `launch` and `install` both do
 * before they differ.
 *
 * The manifest is built in memory and never round-trips through `opys.json`.
 * (`opys build` still writes a publishable one; a deployed launcher feeds
 * `@opys/runtime` a frozen manifest with no `dev` in sight.)
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
    ...extraFlags,
  ]);
  const inputFile = args.getString('input') ?? 'opys.config.mjs';
  const mode = args.getString('mode') ?? command;
  // Runtime features gate rule-tagged vars/artifacts at install + launch — e.g.
  // `--feature java_console` flips Windows `java_bin` from javaw.exe to java.exe.
  // Comma-separated so a single flag can carry several: `--feature a,b`.
  const features = (args.getString('feature') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const { config, configDir } = await loadConfig(inputFile, mode);

  const ctx: BuildContext = {
    log: (scope, msg) => logger.info(`[${scope}] ${msg}`),
    configDir,
    mode,
  };
  const baseManifest = await buildManifest(config, ctx);

  // runClient is the launch-time manifest patch: a shallow per-field override.
  const manifest: Manifest = config.runClient
    ? { ...baseManifest, ...config.runClient(baseManifest) }
    : baseManifest;

  for (const [key, val] of Object.entries(manifest.vars)) {
    if (typeof val !== 'string' && !Array.isArray(val)) {
      throw new Error(
        `var '${key}' must be a string or ConditionalVal[], got ${typeof val}`,
      );
    }
  }

  return { manifest, features };
}
