import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  encodeUnifest,
  resolveConfig,
  emptyValDefs,
  deduplicateUnifacts,
  type Unifact,
  type ArtifactIterable,
} from '@unifest/core';
import { parseArgs } from '../args';
import { UsageError } from '../errors';
import { importConfig } from '../fs';
import type { Logger } from '../logger';

async function collectArtifacts(
  sources: ArtifactIterable[],
): Promise<Unifact[]> {
  const out: Unifact[] = [];
  for (const src of sources) {
    for await (const a of src) out.push(a);
  }
  return deduplicateUnifacts(out);
}

export async function cmdBuild(argv: string[], logger: Logger): Promise<void> {
  const args = parseArgs(argv, [
    { long: 'input', short: 'i', type: 'string' },
    { long: 'output', short: 'o', type: 'string' },
  ]);
  const inputFile = args.getString('input') ?? 'unifest.config.mjs';
  const outputFile = args.getString('output');
  const absConfig = resolve(inputFile);
  const configDir = dirname(absConfig);

  const mod = await importConfig(absConfig);
  if (!mod.default) throw new UsageError(`${inputFile}: no default export`);

  const config = await resolveConfig(mod.default, { mode: 'build' });
  logger.info('Building manifest...');

  const artifacts = await collectArtifacts(config.artifacts ?? []);
  logger.debug(`Collected ${artifacts.length} artifacts`);

  const vars = Array.isArray(config.vars) ? config.vars : emptyValDefs();
  const unifest = { vars, launch: config.command, unifacts: artifacts };
  const json = JSON.stringify(encodeUnifest(unifest), null, 2) + '\n';

  const out = outputFile ?? config.output;
  if (out) {
    await writeFile(resolve(configDir, out), json);
    logger.info(`Written to ${out}`);
  } else {
    process.stdout.write(json);
  }
}
