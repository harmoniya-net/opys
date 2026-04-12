import { dirname, resolve } from 'node:path';
import { install, launch, type InstallProgress } from '@unifest/installer';
import type {
  Unifest,
  ArtifactIterable,
  Unifact,
  ValDefs,
} from '@unifest/core';
import { resolveConfig, emptyValDefs, encodeUnifest } from '@unifest/core';
import type { ManifestSource } from '@unifest/installer';
import { parseArgs } from '../args';
import { UsageError } from '../errors';
import { importConfig } from '../fs';
import {
  renderProgress,
  ProgressWriter,
  initialProgress,
  elapsed,
} from '../progress';
import type { Logger } from '../logger';

async function collectArtifacts(
  sources: ArtifactIterable[],
): Promise<Unifact[]> {
  const out: Unifact[] = [];
  for (const src of sources) {
    for await (const a of src) out.push(a);
  }
  return out;
}

export async function cmdLaunch(argv: string[], logger: Logger): Promise<void> {
  const args = parseArgs(argv, [
    { long: 'input', short: 'i', type: 'string' },
    { long: 'var', type: 'pairs' },
  ]);
  const inputFile = args.getString('input') ?? 'unifest.config.mjs';
  const extraVars = args.getPairs('var');
  const absConfig = resolve(inputFile);
  const configDir = dirname(absConfig);

  const mod = await importConfig(absConfig);
  const config = await resolveConfig(mod.default, { mode: 'launch' });
  const vars = { ...config.runClient?.vars, ...extraVars };

  let manifestSource: ManifestSource;
  if (config.artifacts?.length) {
    logger.info('Building manifest...');
    const artifacts = await collectArtifacts(config.artifacts);
    logger.debug(`Collected ${artifacts.length} artifacts`);
    const vs: ValDefs = Array.isArray(config.vars)
      ? config.vars
      : emptyValDefs();
    const unifest: Unifest = {
      vars: vs,
      launch: config.command,
      unifacts: artifacts,
    };
    manifestSource = unifest;
  } else {
    if (!config.output) throw new UsageError('config.output required');
    manifestSource = resolve(configDir, config.output);
  }

  const t0 = Date.now();
  const pw = new ProgressWriter(process.stderr.isTTY ?? false);
  logger.setProgressWriter(pw);
  logger.info('Installing...');

  await install(manifestSource, {
    vars,
    onProgress(p: InstallProgress) {
      switch (p.phase) {
        case 'download': {
          if (p.fetched > 0) {
            const state = initialProgress(p.total, t0);
            state.fetched = p.fetched;
            pw.update(renderProgress(state));
          }
          break;
        }
        case 'verify':
          pw.finish();
          pw.log(' Verifying...');
          break;
        case 'extract':
          pw.log(
            ` Extracting ${p.count} archive${p.count === 1 ? '' : 's'}...`,
          );
          break;
      }
    },
  });

  pw.finish();
  logger.info(` Ready in ${elapsed(t0)}`);
  logger.info('Launching...');
  const child = await launch(manifestSource, {
    vars,
    install: false,
    log: logger.installerLog(),
  });
  logger.info(` PID ${child.pid}`);
  await new Promise<void>((res, rej) => {
    child.on('exit', (code) =>
      code === 0 || code === null ? res() : rej(new Error(`exit ${code}`)),
    );
    child.on('error', rej);
  });
}
