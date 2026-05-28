import type { Launch, Val, Valset } from '@opys/core';
import type { LaunchGroups } from './plugin';

/** Shared shape of the vanilla / forge-family loader templates. */
export interface LoaderTemplate {
  launch: Launch;
  jvmArgs: Valset;
  mainClass: Val;
  gameArgs: Valset;
}

/** Project a loader template's launch surface into named groups. */
export function launchGroups(t: LoaderTemplate): LaunchGroups {
  return {
    command: t.launch.command,
    jvmArgs: t.jvmArgs,
    mainClass: t.mainClass,
    gameArgs: t.gameArgs,
  };
}
