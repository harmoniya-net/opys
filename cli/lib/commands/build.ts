import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeManifest } from '@torba/core';
import { resolveConfig, buildManifest, type BuildContext } from '@torba/dev';
import { parseArgs } from '../args';
import { UsageError } from '../errors';
import type { Logger } from '../logger';

export async function cmdBuild(argv: string[], logger: Logger): Promise<void> {
  const args = parseArgs(argv, [
    { long: 'input', short: 'i', type: 'string' },
    { long: 'output', short: 'o', type: 'string' },
    { long: 'mode', type: 'string' },
  ]);
  const inputFile = args.getString('input') ?? 'torba.config.mjs';
  const outputFile = args.getString('output');
  const mode = args.getString('mode') ?? 'build';
  const absConfig = resolve(inputFile);
  const configDir = dirname(absConfig);

  const mod = await import(pathToFileURL(absConfig).href);
  if (!mod.default) throw new UsageError(`${inputFile}: no default export`);

  const config = await resolveConfig(mod.default, { mode });

  const ctx: BuildContext = {
    log: (scope, msg) => logger.info(`[${scope}] ${msg}`),
    configDir,
    mode,
  };
  const manifest = await buildManifest(config, ctx);
  const json = JSON.stringify(encodeManifest(manifest), null, 2) + '\n';

  const out = outputFile ?? config.output;
  if (out) {
    await writeFile(resolve(configDir, out), json);
    logger.info(`Written to ${out}`);
  } else {
    process.stdout.write(json);
  }
}
