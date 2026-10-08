import type { ChildProcess } from 'node:child_process';
import { ChildExitError } from './errors';

/** Resolve when the child exits cleanly, reject with its code otherwise. */
export function awaitExit(child: ChildProcess): Promise<void> {
  return new Promise<void>((res, rej) => {
    child.on('exit', (code) =>
      code === 0 || code === null ? res() : rej(new ChildExitError(code)),
    );
    child.on('error', rej);
  });
}
