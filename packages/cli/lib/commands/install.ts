import { launch } from '@opys/runtime';
import { valValues, type Manifest, type Valset } from '@opys/core';
import { prepare } from '../prepare';
import { installWithProgress } from '../install-progress';
import { awaitExit } from '../child';
import type { Logger } from '../logger';

/**
 * The flag that tells horno to stop after installing.
 *
 * It goes at the front of the JVM line, where any `-D` is valid, rather than
 * into the manifest — `opys.json` is frozen and describes an installation, not
 * a particular run of one. This is a CLI feature, not a format change.
 */
const INSTALL_ONLY = '-Dhorno.installOnly=true';

/** Whether the manifest's own arguments name horno at all. */
function usesHorno(args: Valset): boolean {
  return args.some((arg) =>
    valValues(arg).some((value) => value.startsWith('-Dhorno.')),
  );
}

/**
 * Install everything and stop before the game starts.
 *
 * Two halves, and only the first is opys's. `install()` fetches, verifies and
 * extracts what the manifest lists. What it cannot do is the part that exists
 * only on the machine that runs it: the loader's processors build a patched
 * client jar, and pre-1.13 the client jar is rewritten outright. Both are
 * horno's, and horno does them on the way into the game — so this runs horno
 * once with nothing to launch afterwards.
 *
 * A build with no loader install step — 1.6.1 to 1.12.2, where Forge is a
 * LaunchWrapper tweaker and a list of libraries — names no horno properties,
 * and there the artifact install is the whole installation.
 */
export async function cmdInstall(
  argv: string[],
  logger: Logger,
  command: string,
): Promise<void> {
  const { manifest, features } = await prepare(argv, logger, command);

  await installWithProgress(manifest, features, logger);

  if (!manifest.launch || !usesHorno(manifest.launch.args)) {
    logger.info(' No loader install step; everything is in place');
    return;
  }

  logger.info('Running the loader install...');
  const installOnly: Manifest = {
    ...manifest,
    launch: {
      ...manifest.launch,
      args: [INSTALL_ONLY, ...manifest.launch.args],
    },
  };
  const child = await launch(installOnly, { install: false, features });
  await awaitExit(child);
  logger.info(' Installed');
}
