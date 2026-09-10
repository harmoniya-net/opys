import type { ChildProcess } from 'node:child_process';

/** Resolve when the child exits cleanly, reject with its code otherwise. */
export function awaitExit(child: ChildProcess): Promise<void> {
  return new Promise<void>((res, rej) => {
    child.on('exit', (code) =>
      code === 0 || code === null ? res() : rej(new Error(`exit ${code}`)),
    );
    child.on('error', rej);
  });
}
