import { interpolate, resolveVars } from '@unifest/core';
import type { SatisfiesOsOptions } from '@unifest/rules';
import { type ChildProcess, spawn } from 'node:child_process';
import {
  type InstallOptions,
  type ManifestSource,
  install,
  resolveManifest,
} from './install';
import { currentPlatform } from './platform';

export interface LaunchOptions {
  /** Override the detected platform. */
  platform?: SatisfiesOsOptions;
  /** Extra variables that override manifest vars (e.g. username, uuid, token). */
  vars?: Record<string, string>;
  /** Install options. Pass `false` to skip installation entirely. Defaults to `{}`. */
  install?: InstallOptions | false;
}

/**
 * Install all artifacts and then spawn the process described by a Unifest
 * launch config.
 *
 * By default, `install()` runs before spawning. Pass `install: false` to skip
 * it (e.g. when you know everything is already on disk).
 *
 * Resolves all variables and interpolates them into the command, arguments,
 * working directory, and environment before spawning. Inherits stdio from the
 * parent process.
 *
 * Returns the `ChildProcess`; the caller is responsible for waiting on it.
 *
 * @throws if the manifest has no launch config.
 *
 * @example
 * ```ts
 * import { launch } from '@unifest/installer';
 * import { Unifest } from '@unifest/core';
 *
 * const manifest = await Unifest.parse(await fs.readFile('unifest.json', 'utf8'));
 * const child = await launch(manifest, {
 *   vars: { username: 'Player', uuid: '...', token: '...' },
 *   install: { onProgress: (n, t) => console.log(`${n}/${t}`) },
 * });
 * await new Promise((res, rej) => {
 *   child.on('exit', (code) => (code === 0 ? res() : rej(new Error(`exit ${code}`))));
 *   child.on('error', rej);
 * });
 * ```
 */
export async function launch(
  source: ManifestSource,
  options: LaunchOptions = {},
): Promise<ChildProcess> {
  const manifest = await resolveManifest(source);
  const { vars: extraVars = {}, install: installOpts = {} } = options;
  const platform = options.platform ?? currentPlatform();

  if (installOpts !== false) {
    await install(manifest, { platform, vars: extraVars, ...installOpts });
  }

  const config = manifest.launch;
  if (!config) throw new Error('No launch config in manifest');

  const flatVars = { ...manifest.vars.resolve(platform), ...extraVars };
  const vars = resolveVars(flatVars);

  const command = interpolate(config.command, vars);
  const workdir = interpolate(config.workdir, vars);
  const args = config.resolvedArgs(platform).map((a) => interpolate(a, vars));

  const rawEnvs = config.resolvedEnvs(platform);
  const envs: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawEnvs)) {
    envs[k] = interpolate(v, vars);
  }

  return spawn(command, args, {
    cwd: workdir,
    env: { ...process.env, ...envs },
    stdio: 'inherit',
  });
}
