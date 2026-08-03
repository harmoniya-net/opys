import type { OsName } from '@opys/core';

/** Archs every vendor resolver in this package targets. */
export type SupportedArch = 'x86_64' | 'aarch64';

/** An (OS, arch) pair a vendor resolver fetches a binary for. */
export interface Platform {
  readonly os: OsName;
  readonly arch: SupportedArch;
}

export const DEFAULT_PLATFORMS: readonly Platform[] = [
  { os: 'linux', arch: 'x86_64' },
  { os: 'linux', arch: 'aarch64' },
  { os: 'osx', arch: 'x86_64' },
  { os: 'osx', arch: 'aarch64' },
  { os: 'windows', arch: 'x86_64' },
  { os: 'windows', arch: 'aarch64' },
];

/**
 * `/Contents/Home` on macOS, empty elsewhere. Every vendor this package
 * supports (Temurin, Zulu, GraalVM CE) ships its macOS archive as a
 * `.jdk`-style bundle with this layout — verified against real archives,
 * not assumed from convention.
 */
export function macHomeSuffix(os: OsName): string {
  return os === 'osx' ? '/Contents/Home' : '';
}
