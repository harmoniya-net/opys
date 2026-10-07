import { resolve } from 'node:path';
import { encodeManifest, writeBundle } from '@opys/core';
import { buildManifest, type BuildContext } from '@opys/dev';
import { parseArgs } from '../args';
import { loadConfig } from '../load-config';
import type { Logger } from '../logger';

/**
 * Build the config into a bundle: the manifest and the blobs it names, as
 * the one file that is published.
 *
 * With no output named, the manifest alone is printed as JSON. That is a
 * view of it for reading and diffing, not something to install from — the
 * blobs are not in it.
 */
export async function cmdBuild(
  argv: string[],
  logger: Logger,
  command: string,
): Promise<void> {
  const args = parseArgs(argv, [
    { long: 'input', short: 'i', type: 'string' },
    { long: 'output', short: 'o', type: 'string' },
    { long: 'mode', type: 'string' },
  ]);
  const inputFile = args.getString('input') ?? 'opys.config.mjs';
  const outputFile = args.getString('output');
  const mode = args.getString('mode') ?? command;

  const { config, configDir } = await loadConfig(inputFile, mode);

  const ctx: BuildContext = {
    log: (scope, msg) => logger.info(`[${scope}] ${msg}`),
    configDir,
    mode,
  };
  const { manifest, blobs } = await buildManifest(config, ctx);

  const out = outputFile ?? config.output;
  if (out) {
    await writeBundle(resolve(configDir, out), manifest, blobs);
    const count = Object.keys(blobs).length;
    logger.info(
      `Written to ${out} (${manifest.artifacts.length} artifact(s), ${count} blob(s))`,
    );
  } else {
    process.stdout.write(
      JSON.stringify(encodeManifest(manifest), null, 2) + '\n',
    );
  }
}
