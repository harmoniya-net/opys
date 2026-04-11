import { install, type InstallProgress } from '@unifest/installer';
import { parseArgs } from '../args';
import { DEFAULT_CONCURRENCY } from '../constants';
import { ProgressWriter, renderProgress } from '../progress';

export async function cmdInstall(argv: string[]): Promise<void> {
  const args = parseArgs(argv, [
    { long: 'input', short: 'i', type: 'string' },
    { long: 'jobs', short: 'j', type: 'string' },
    { long: 'no-verify', type: 'boolean' },
    { long: 'var', type: 'pairs' },
  ]);

  const inputFile = args.getString('input') ?? 'wizard.json';
  const jobsStr = args.getString('jobs');
  const concurrency =
    jobsStr !== undefined ? parseInt(jobsStr, 10) : DEFAULT_CONCURRENCY;
  const verifyIntegrity = !args.getBoolean('no-verify');
  const vars = args.getPairs('var');

  const t0 = Date.now();
  const pw = new ProgressWriter(process.stderr.isTTY ?? false);
  let downloaded = 0;

  process.stderr.write(`Installing from ${inputFile}\n`);

  await install(inputFile, {
    vars,
    concurrency,
    verifyIntegrity,
    onProgress(p: InstallProgress) {
      switch (p.phase) {
        case 'resolve':
          pw.log('  Resolving manifest...');
          break;
        case 'download': {
          if (p.fetched === 0 && p.activeFiles.length === 0) {
            const skipNote = p.skipped > 0 ? ` (${p.skipped} cached)` : '';
            pw.log(
              p.total === 0
                ? `  All ${p.skipped} files already cached`
                : `  Downloading ${p.total} files${skipNote}`,
            );
          } else {
            downloaded = p.fetched;
            pw.update(renderProgress(p.fetched, p.total, t0, p.activeFiles));
          }
          break;
        }
        case 'verify':
          pw.finish();
          pw.log('  Verifying integrity...');
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
  process.stderr.write(
    `  Done in ${ProgressWriter.elapsed(t0)} — ${downloaded} downloaded\n`,
  );
}
