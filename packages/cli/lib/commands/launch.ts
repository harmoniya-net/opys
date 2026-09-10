import { launch } from '@opys/runtime';
import { prepare } from '../prepare';
import { installWithProgress } from '../install-progress';
import { awaitExit } from '../child';
import type { Logger } from '../logger';

export async function cmdLaunch(
  argv: string[],
  logger: Logger,
  command: string,
): Promise<void> {
  const { manifest, features } = await prepare(argv, logger, command);

  await installWithProgress(manifest, features, logger);

  logger.info('Launching...');
  const child = await launch(manifest, { install: false, features });
  logger.info(` PID ${child.pid}`);
  await awaitExit(child);
}
