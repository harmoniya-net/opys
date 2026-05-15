import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  encodeManifest,
  resolveConfig,
  deduplicateArtifacts,
  validateManifest,
  type Artifact,
  type ArtifactIterable,
} from '@torba/core';
import { parseArgs } from '../args';
import { UsageError } from '../errors';
import type { Logger } from '../logger';

async function collectArtifacts(
  sources: ArtifactIterable[],
): Promise<Artifact[]> {
  const out: Artifact[] = [];
  for (const src of sources) {
    for await (const a of src) out.push(a);
  }
  return deduplicateArtifacts(out);
}

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

  const mod = await import(absConfig);
  if (!mod.default) throw new UsageError(`${inputFile}: no default export`);

  const config = await resolveConfig(mod.default, { mode });
  logger.info('Building manifest...');

  const artifacts = await collectArtifacts(config.manifest?.artifacts ?? []);
  logger.debug(`Collected ${artifacts.length} artifacts`);

  const manifest = {
    vars: config.manifest?.vars ?? {},
    launch: config.manifest?.launch,
    artifacts: artifacts,
    ...(config.manifest?.restrict
      ? { restrict: config.manifest.restrict }
      : {}),
  };
  validateManifest(manifest);
  const json = JSON.stringify(encodeManifest(manifest), null, 2) + '\n';

  const out = outputFile ?? config.output;
  if (out) {
    await writeFile(resolve(configDir, out), json);
    logger.info(`Written to ${out}`);
  } else {
    process.stdout.write(json);
  }
}
