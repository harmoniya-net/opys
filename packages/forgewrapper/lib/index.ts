import type { MojangArgValue } from '@opys/mojang';

export const FORGE_WRAPPER_MAIN =
  'io.github.zekerzhayard.forgewrapper.installer.Main';

export const DEFAULT_FORGE_WRAPPER = {
  version: 'prism-2025-12-07',
  url: 'https://files.prismlauncher.org/maven/io/github/zekerzhayard/ForgeWrapper/prism-2025-12-07/ForgeWrapper-prism-2025-12-07.jar',
  sha1: '4c4653d80409e7e968d3e3209196ffae778b7b4e',
} as const;

export interface ForgeWrapperOptions {
  /** Download URL for the ForgeWrapper JAR. */
  url?: string;
  /** Optional sha1 for integrity verification. */
  sha1?: string;
  /** Optional declared size in bytes. */
  size?: number;
  /** Override the destination path under `${library_directory}`. */
  path?: string;
}

export const FORGE_MODULE_ARGS = new Set([
  '-p',
  '--module-path',
  '--add-modules',
  '--add-reads',
  '--add-opens',
  '--add-exports',
]);

/**
 * Strip module-path JVM args from the merged arg list.
 * ForgeWrapper (PrismLauncher fork) applies these programmatically via
 * Unsafe/MethodHandles.Lookup, bypassing Java 25 module system restrictions.
 * Also strips -DignoreList since there is no module-path scanning.
 */
export function stripModuleArgs(jvm: MojangArgValue[]): MojangArgValue[] {
  const result: MojangArgValue[] = [];
  let skipNext = false;
  for (const arg of jvm) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    const raw = typeof arg === 'string' ? arg : '';
    if (FORGE_MODULE_ARGS.has(raw)) {
      skipNext = true;
      continue;
    }
    if (raw.startsWith('-DignoreList=')) {
      continue;
    }
    result.push(arg);
  }
  return result;
}
