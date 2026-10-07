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
  const { source, features, vars } = await prepare(argv, logger, command);

  await installWithProgress(source, { features, vars }, logger);

  logger.info('Launching...');
  const child = await launch(source, { install: false, features, vars });
  logger.info(` PID ${child.pid}`);
  await awaitExit(child);
}
