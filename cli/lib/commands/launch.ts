import { dirname, resolve } from 'node:path';
import {
  install,
  launch,
  type InstallProgress,
  type ManifestSource,
} from '@unifest/installer';
import {
  Unifest,
  ValDefs,
  resolveConfig,
  type ArtifactIterable,
  type Unifact,
} from '@unifest/core';
import { parseArgs } from '../args';
import { UsageError } from '../errors';
import { importConfig } from '../fs';
import { renderProgress, ProgressWriter } from '../progress';
import type { Logger } from '../logger';

async function collectArtifacts(
  sources: ArtifactIterable[],
): Promise<Unifact[]> {
  const out: Unifact[] = [];
  for (const src of sources) for await (const a of src) out.push(a);
  return out;
}

export async function cmdLaunch(argv: string[], logger: Logger): Promise<void> {
  const args = parseArgs(argv, [
    { long: 'input', short: 'i', type: 'string' },
    { long: 'var', type: 'pairs' },
  ]);

  const inputFile = args.getString('input') ?? 'unifest.config.mjs';
  const extraVars = args.getPairs('var');

  const absConfigFile = resolve(inputFile);
  const configDir = dirname(absConfigFile);
  const mod = await importConfig(absConfigFile);
  const config = await resolveConfig(mod.default, { mode: 'launch' });

  const vars = { ...config.runClient?.vars, ...extraVars };

  // Dev mode: config has artifacts → build manifest in-memory with local-file sources.
  // Distribution mode: use the pre-built manifest file (config.output).
  let manifestSource: ManifestSource;
  if (config.artifacts?.length) {
    logger.info('Building manifest...');
    const allArtifacts = await collectArtifacts(config.artifacts);
    logger.debug(`Collected ${allArtifacts.length} artifacts`);
    const rawVars = config.vars;
    const vars2 =
      rawVars instanceof ValDefs
        ? rawVars
        : ValDefs.CODEC.decode(rawVars ?? {});
    manifestSource = new Unifest(vars2, config.command, allArtifacts);
  } else {
    if (!config.output)
      throw new UsageError('config.output is required for launch');
    manifestSource = resolve(configDir, config.output);
  }

  const t0 = Date.now();
  const pw = new ProgressWriter(process.stderr.isTTY ?? false);
  logger.setProgressWriter(pw);

  logger.info('Installing...');

  await install(manifestSource, {
    vars,
    log:
      logger.enables('debug') || logger.enables('warn')
        ? logger.installerLog()
        : undefined,
    onProgress(p: InstallProgress) {
      if (!logger.enables('info')) return;
      switch (p.phase) {
        case 'resolve':
          break;
        case 'download': {
          if (p.fetched === 0 && p.activeFiles.length === 0) {
            if (p.total > 0) {
              const skipNote = p.skipped > 0 ? ` (${p.skipped} cached)` : '';
              pw.log(`  Downloading ${p.total} files${skipNote}`);
            }
          } else {
            pw.update(renderProgress(p.fetched, p.total, t0, p.activeFiles));
          }
          break;
        }
        case 'verify':
          pw.finish();
          pw.log('  Verifying...');
          break;
        case 'extract':
          pw.log(
            `  Extracting ${p.count} archive${p.count === 1 ? '' : 's'}...`,
          );
          break;
      }
    },
  });

  pw.finish();
  logger.info(`  Ready in ${ProgressWriter.elapsed(t0)}`);
  logger.info('Launching...');

  const child = await launch(manifestSource, { vars, install: false });

  logger.info(`  PID ${child.pid}`);

  await new Promise<void>((res, rej) => {
    child.on('exit', (code) =>
      code === 0 || code === null
        ? res()
        : rej(new Error(`Process exited with code ${code}`)),
    );
    child.on('error', rej);
  });
}
