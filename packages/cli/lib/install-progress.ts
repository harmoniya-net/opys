import {
  install,
  type InstallProgress,
  type ManifestSource,
} from '@opys/runtime';
import {
  renderProgress,
  ProgressWriter,
  initialProgress,
  elapsed,
  basename,
} from './progress';
import type { Logger } from './logger';

/** Minimum gap between progress redraws, in milliseconds. */
const RENDER_THROTTLE_MS = 80;

/** Run the install pipeline, drawing the progress both commands draw. */
const counted = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** `3 stale files and 1 directory`, leaving out whichever there are none of. */
export function removedLine(files: number, directories: number): string {
  return [
    files > 0 ? counted(files, 'stale file', 'stale files') : '',
    directories > 0 ? counted(directories, 'directory', 'directories') : '',
  ]
    .filter(Boolean)
    .join(' and ');
}

export async function installWithProgress(
  source: ManifestSource,
  options: { features: string[]; vars: Record<string, string> },
  logger: Logger,
): Promise<void> {
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

  await install(source, {
    ...options,
    onProgress(p: InstallProgress) {
      switch (p.phase) {
        case 'download':
          state.total = p.total;
          state.fetched = p.fetched;
          state.bytes = p.bytes;
          state.totalBytes = p.totalBytes;
          render(true);
          break;
        case 'download:start':
          active.set(p.path, { name: p.path, bytes: 0, total: p.totalBytes });
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
        case 'cleanup':
          pw.log(` Removed ${removedLine(p.removed, p.directories)}`);
          break;
      }
    },
  });

  pw.finish();
  logger.info(` Ready in ${elapsed(t0)}`);
}
