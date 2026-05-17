import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { install, launch, type InstallProgress } from '@torba/runtime';
import { parseManifest, type Manifest } from '@torba/core';
import { resolveConfig } from '@torba/dev';
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

export async function cmdLaunch(argv: string[], logger: Logger): Promise<void> {
  const args = parseArgs(argv, [
    { long: 'input', short: 'i', type: 'string' },
    { long: 'mode', type: 'string' },
  ]);
  const inputFile = args.getString('input') ?? 'torba.config.mjs';
  const mode = args.getString('mode') ?? 'launch';
  const absConfig = resolve(inputFile);
  const configDir = dirname(absConfig);

  const mod = await import(pathToFileURL(absConfig).href);
  if (!mod.default) throw new UsageError(`${inputFile}: no default export`);
  const config = await resolveConfig(mod.default, { mode });

  if (!config.output) {
    throw new UsageError('config.output is required to locate torba.json');
  }
  // Launch reads the built manifest from disk — it never rebuilds.
  const manifestPath = resolve(configDir, config.output);
  const baseManifest = await parseManifest(
    await readFile(manifestPath, 'utf8'),
  );

  // runClient is the launch-time manifest patch: a shallow per-field override.
  const manifest: Manifest = config.runClient
    ? { ...baseManifest, ...config.runClient(baseManifest) }
    : baseManifest;

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

  await install(manifest, {
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
  const child = await launch(manifest, {
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
