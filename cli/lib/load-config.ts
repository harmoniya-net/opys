import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveConfig, type TorbaConfig } from '@torba/dev';
import { UsageError } from './errors';

export interface LoadedConfig {
  config: TorbaConfig;
  configDir: string;
}

/** Import a config file, resolve it for the given mode, and report its directory. */
export async function loadConfig(
  inputFile: string,
  mode: string,
): Promise<LoadedConfig> {
  const absConfig = resolve(inputFile);
  const configDir = dirname(absConfig);

  const mod = await import(pathToFileURL(absConfig).href);
  if (!mod.default) throw new UsageError(`${inputFile}: no default export`);

  const config = await resolveConfig(mod.default, { mode });
  return { config, configDir };
}
