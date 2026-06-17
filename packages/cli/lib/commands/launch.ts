import { install, launch, type InstallProgress } from '@opys/runtime';
import type { Manifest } from '@opys/core';
import { buildManifest, type BuildContext } from '@opys/dev';
import { parseArgs } from '../args';
import { loadConfig } from '../load-config';
import {
  renderProgress,
  ProgressWriter,
  initialProgress,
  elapsed,
  basename,
} from '../progress';
import type { Logger } from '../logger';

/** Minimum gap between progress redraws, in milliseconds. */
const RENDER_THROTTLE_MS = 80;

export async function cmdLaunch(
  argv: string[],
  logger: Logger,
  command: string,
): Promise<void> {
  const args = parseArgs(argv, [
    { long: 'input', short: 'i', type: 'string' },
    { long: 'mode', type: 'string' },
    { long: 'feature', type: 'string' },
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

  // Build the manifest in-memory from the config and launch it directly —
  // no opys.json round-trip. (`opys build` still writes a publishable
  // manifest; a deployed launcher feeds `@opys/runtime` a frozen one.)
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
    if (!force && now - lastRender < RENDER_THROTTLE_MS) return;
    lastRender = now;
    state.active = [...active.values()];
    pw.update(renderProgress(state));
  };

  await install(manifest, {
    features,
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
  const child = await launch(manifest, { install: false, features });
  logger.info(` PID ${child.pid}`);
  await new Promise<void>((res, rej) => {
    child.on('exit', (code) =>
      code === 0 || code === null ? res() : rej(new Error(`exit ${code}`)),
    );
    child.on('error', rej);
  });
}
