import type { Launch, Val, Valset } from '@opys/core';
import type { LaunchGroups } from './plugin';

/** Shared shape of the vanilla / forge-family loader templates. */
export interface LoaderTemplate {
  launch: Launch;
  jvmArgs: Valset;
  mainClass: Val;
  gameArgs: Valset;
}

/**
 * The launch groups every loader exposes, and so what a config may name on
 * any of them: `'@forge.jvmArgs'`, `'@fabric.mainClass'`.
 */
export type LoaderGroups = 'command' | 'jvmArgs' | 'mainClass' | 'gameArgs';

/** Project a loader template's launch surface into named groups. */
export function launchGroups(t: LoaderTemplate): LaunchGroups<LoaderGroups> {
  return {
    command: t.launch.command,
    jvmArgs: t.jvmArgs,
    mainClass: t.mainClass,
    gameArgs: t.gameArgs,
  };
}
