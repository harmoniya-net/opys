import type { OsOptions } from '@torba/core';

export function currentPlatform(
  platform: string = process.platform,
  arch: string = process.arch,
): OsOptions {
  return {
    name:
      platform === 'win32'
        ? 'windows'
        : platform === 'darwin'
          ? 'osx'
          : 'linux',
    version: '',
    arch: arch === 'arm64' ? 'aarch64' : 'x86_64',
  };
}
