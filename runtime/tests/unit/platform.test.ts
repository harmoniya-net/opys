import { describe, expect, it } from 'vitest';
import { currentPlatform } from '../../lib/platform';

describe('currentPlatform', () => {
  it.each([
    ['win32', 'x64', 'windows', 'x86_64'],
    ['darwin', 'x64', 'osx', 'x86_64'],
    ['linux', 'x64', 'linux', 'x86_64'],
    ['linux', 'arm64', 'linux', 'aarch64'],
    ['darwin', 'arm64', 'osx', 'aarch64'],
  ])(
    'platform=%s arch=%s → name=%s arch=%s',
    (platform, arch, expectedName, expectedArch) => {
      const p = currentPlatform(platform, arch);
      expect(p.name).toBe(expectedName);
      expect(p.arch).toBe(expectedArch);
    },
  );

  it('unknown platform falls back to linux', () => {
    expect(currentPlatform('freebsd', 'x64').name).toBe('linux');
  });

  it('unknown arch falls back to x86_64', () => {
    expect(currentPlatform('linux', 'ppc64').arch).toBe('x86_64');
  });

  it('version is always empty string', () => {
    expect(currentPlatform('linux', 'x64').version).toBe('');
  });
});
