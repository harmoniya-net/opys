import { afterEach, describe, expect, it } from 'vitest';
import { homedir } from 'node:os';
import { userDataDir } from '../../lib/paths';

const realPlatform = process.platform;
const realAppData = process.env.APPDATA;
const realXdg = process.env.XDG_DATA_HOME;

const setPlatform = (value: NodeJS.Platform) =>
  Object.defineProperty(process, 'platform', { value, configurable: true });

afterEach(() => {
  setPlatform(realPlatform);
  if (realAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = realAppData;
  if (realXdg === undefined) delete process.env.XDG_DATA_HOME;
  else process.env.XDG_DATA_HOME = realXdg;
});

describe('userDataDir', () => {
  it('uses %APPDATA% on Windows', () => {
    setPlatform('win32');
    process.env.APPDATA = '/fake/AppData/Roaming';
    expect(userDataDir('lanka')).toBe('/fake/AppData/Roaming/lanka');
  });

  it('falls back to homedir on Windows when APPDATA is unset', () => {
    setPlatform('win32');
    delete process.env.APPDATA;
    expect(userDataDir('lanka').startsWith(homedir())).toBe(true);
  });

  it('uses Application Support on macOS', () => {
    setPlatform('darwin');
    expect(userDataDir('lanka')).toBe(
      `${homedir()}/Library/Application Support/lanka`,
    );
  });

  it('uses XDG_DATA_HOME on Linux when set', () => {
    setPlatform('linux');
    process.env.XDG_DATA_HOME = '/custom/data';
    expect(userDataDir('lanka')).toBe('/custom/data/lanka');
  });

  it('falls back to ~/.local/share on Linux without XDG_DATA_HOME', () => {
    setPlatform('linux');
    delete process.env.XDG_DATA_HOME;
    expect(userDataDir('lanka')).toBe(`${homedir()}/.local/share/lanka`);
  });
});
