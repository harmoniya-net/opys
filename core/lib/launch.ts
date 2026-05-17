import { z } from 'zod';
import { parseValset, encodeValset, resolveValset, type Valset } from './val';
import type { OsOptions } from '@torba/mojang-rules';
import {
  parseValDefs,
  encodeValDefs,
  resolveValDefs,
  type ValDefs,
} from './valdefs';

export interface Launch {
  readonly command: string;
  readonly workdir: string;
  readonly args: Valset;
  readonly envs: ValDefs;
}

/** Wire shape — `args`/`envs` carry shorthand rules until decoded. */
export const LaunchWireSchema = z.object({
  command: z.string(),
  workdir: z.string(),
  args: z.any().optional(),
  envs: z.any().optional(),
});
export type LaunchWire = z.infer<typeof LaunchWireSchema>;

/** Total decode — normalizes `args`/`envs` to resolved rulesets. */
export function decodeLaunch(raw: LaunchWire): Launch {
  return {
    command: raw.command,
    workdir: raw.workdir,
    args: raw.args ? parseValset(raw.args) : [],
    envs: raw.envs ? parseValDefs(raw.envs) : {},
  };
}

export function encodeLaunch(launch: Launch): LaunchWire {
  return {
    command: launch.command,
    workdir: launch.workdir,
    args: encodeValset(launch.args),
    envs: encodeValDefs(launch.envs),
  };
}

export function resolvedArgs(
  launch: Launch,
  os: OsOptions,
  feats: string[] = [],
): string[] {
  return resolveValset(launch.args, os, feats);
}

export function resolvedEnvs(
  launch: Launch,
  os: OsOptions,
  feats: string[] = [],
): Record<string, string> {
  return resolveValDefs(launch.envs, os, feats);
}
