import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { install, launch, type InstallProgress } from '@torba/runtime';
import type { Manifest, ArtifactIterable, Artifact } from '@torba/core';
import { resolveConfig, validateManifest } from '@torba/core';
import type { ManifestSource } from '@torba/runtime';
import { parseArgs } from '../args';
import { UsageError } from '../errors';
import {
  renderProgress,
  ProgressWriter,
  initialProgress,
  elapsed,
  basename,
} from '../progress';
import type { Logger } from '../logger';

async function collectArtifacts(
  sources: ArtifactIterable[],
): Promise<Artifact[]> {
  const out: Artifact[] = [];
  for (const src of sources) {
    for await (const a of src) out.push(a);
  }
  return out;
}

export async function cmdLaunch(argv: string[], logger: Logger): Promise<void> {
  const args = parseArgs(argv, [
    { long: 'input', short: 'i', type: 'string' },
    { long: 'var', type: 'pairs' },
    { long: 'mode', type: 'string' },
  ]);
  const inputFile = args.getString('input') ?? 'torba.config.mjs';
  const extraVars = args.getPairs('var');
  const mode = args.getString('mode') ?? 'launch';
  const absConfig = resolve(inputFile);
  const configDir = dirname(absConfig);

  const mod = await import(pathToFileURL(absConfig).href);
  if (!mod.default) throw new UsageError(`${inputFile}: no default export`);
  const config = await resolveConfig(mod.default, { mode });
  const vars = { ...config.runClient?.vars, ...extraVars };

  let manifestSource: ManifestSource;
  if (config.manifest?.artifacts?.length) {
    logger.info('Building manifest...');
    const artifacts = await collectArtifacts(config.manifest.artifacts);
    logger.debug(`Collected ${artifacts.length} artifacts`);
    const manifest: Manifest = {
      vars: config.manifest.vars ?? {},
      launch: config.manifest.launch,
      artifacts: artifacts,
      ...(config.manifest.restrict
        ? { restrict: config.manifest.restrict }
        : {}),
    };
    validateManifest(manifest);
    manifestSource = manifest;
  } else {
    if (!config.output) throw new UsageError('config.output required');
    manifestSource = resolve(configDir, config.output);
  }

  const t0 = Date.now();
  const pw = new ProgressWriter(process.stderr.isTTY ?? false);
  logger.setProgressWriter(pw);
  logger.info('Installing...');

  const active = new Map<
    string,
    { name: string; bytes: number; total: number }
  >();
  const state = initialProgress(0, t0);
  let lastRender = 0;
  const render = (force = false) => {
    const now = Date.now();
    if (!force && now - lastRender < 80) return;
    lastRender = now;
    state.active = [...active.values()];
    pw.update(renderProgress(state));
  };

  await install(manifestSource, {
    vars,
    onProgress(p: InstallProgress) {
      switch (p.phase) {
        case 'download':
          state.total = p.total;
          state.fetched = p.fetched;
          render(true);
          break;
        case 'download:start':
          active.set(p.path, { name: p.path, bytes: 0, total: p.total });
          render();
          break;
        case 'download:bytes': {
          const entry = active.get(p.path);
          if (entry) {
            entry.bytes = p.bytes;
            render();
          }
          break;
        }
        case 'download:done':
          active.delete(p.path);
          pw.log(`  ✓ ${basename(p.path)}`);
          break;
        case 'verify':
          pw.finish();
          pw.log(' Verifying...');
          break;
        case 'extract':
          pw.log(
            ` Extracting ${p.count} archive${p.count === 1 ? '' : 's'}...`,
          );
          break;
        case 'sweep':
          pw.log(` Swept ${p.removed} stale file${p.removed === 1 ? '' : 's'}`);
          break;
      }
    },
  });

  pw.finish();
  logger.info(` Ready in ${elapsed(t0)}`);
  logger.info('Launching...');
  const child = await launch(manifestSource, {
    vars,
    cwd: config.runClient?.dir,
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
