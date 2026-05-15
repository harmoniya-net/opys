import { spawn, type ChildProcess } from 'node:child_process';
import {
  resolveVars,
  resolveValDefs,
  interpolate,
  resolvedArgs,
  resolvedEnvs,
} from '@torba/core';
import type { OsOptions } from '@torba/rules';
import { install, type InstallOptions } from './install';
import { resolveManifest } from './phases/resolve';
import type { ManifestSource } from './phases/resolve';
import { currentPlatform } from './platform';

export interface LaunchOptions {
  platform?: OsOptions;
  vars?: Record<string, string>;
  /** Override the manifest's `command.workdir`. Interpolated with vars. */
  cwd?: string;
  install?: InstallOptions | false;
  log?: (level: 'debug' | 'warn', msg: string) => void;
}

export async function launch(
  source: ManifestSource,
  options: LaunchOptions = {},
): Promise<ChildProcess> {
  const manifest = await resolveManifest(source);
  const { vars: extraVars = {}, install: installOpts = {}, log } = options;
  const platform = options.platform ?? currentPlatform();

  if (installOpts !== false) {
    await install(manifest, { platform, vars: extraVars, ...installOpts });
  }

  const config = manifest.launch;
  if (!config) throw new Error('No launch config in manifest');

  const flatVars = { ...resolveValDefs(manifest.vars, platform), ...extraVars };
  const vars = resolveVars(flatVars);

  const command = interpolate(config.command, vars);
  const workdir = interpolate(options.cwd ?? config.workdir, vars);
  const args = resolvedArgs(config, platform).map((a) => interpolate(a, vars));
  const rawEnvs = resolvedEnvs(config, platform);
  const envs: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawEnvs)) {
    envs[k] = interpolate(v, vars);
  }

  log?.('debug', `cwd: ${workdir}`);
  log?.('debug', `cmd: ${command}`);
  for (const arg of args) log?.('debug', `arg: ${arg}`);

  return spawn(command, [...args], {
    cwd: workdir,
    env: { ...process.env, ...envs },
    stdio: 'inherit',
  });
}
