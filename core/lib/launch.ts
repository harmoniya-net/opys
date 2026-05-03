import { z } from 'zod';
import {
  parseValset,
  encodeValset,
  resolveValset,
  type Valset,
} from '@torba/rules';
import type { OsOptions } from '@torba/rules';
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

const LaunchRawSchema = z.object({
  command: z.string(),
  workdir: z.string(),
  args: z.any().optional(),
  envs: z.any().optional(),
});

export function parseLaunch(raw: z.infer<typeof LaunchRawSchema>): Launch {
  return {
    command: raw.command,
    workdir: raw.workdir,
    args: raw.args ? parseValset(raw.args) : [],
    envs: raw.envs ? parseValDefs(raw.envs) : {},
  };
}

export function encodeLaunch(launch: Launch): unknown {
  return {
    command: launch.command,
    workdir: launch.workdir,
    args: encodeValset(launch.args),
    envs: encodeValDefs(launch.envs),
  };
}

export const LaunchSchema: z.ZodType<Launch> = LaunchRawSchema.transform(
  parseLaunch,
) as unknown as z.ZodType<Launch>;

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
