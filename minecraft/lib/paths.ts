import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Per-user data directory for an application, matching OS conventions:
 *
 * - Windows: `%APPDATA%\<name>`            (e.g. `C:\Users\you\AppData\Roaming\<name>`)
 * - macOS:   `~/Library/Application Support/<name>`
 * - Linux:   `$XDG_DATA_HOME/<name>` or `~/.local/share/<name>`
 */
export function userDataDir(name: string): string {
  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? homedir(), name);
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', name);
  }
  const base = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
  return join(base, name);
}
