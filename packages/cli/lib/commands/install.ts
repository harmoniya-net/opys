import { prepare } from '../prepare';
import { installWithProgress } from '../install-progress';
import type { Logger } from '../logger';

/**
 * Install what the manifest lists and stop before the game starts.
 *
 * That is the whole of it. Whatever a loader does on its own first run, such
 * as Forge building a patched client jar, happens when the game starts, as it
 * does from a launcher; an install knows nothing of any loader.
 */
export async function cmdInstall(
  argv: string[],
  logger: Logger,
  command: string,
): Promise<void> {
  const { source, features, vars } = await prepare(argv, logger, command);
  await installWithProgress(source, { features, vars }, logger);
}
