export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/** What `opys` started ran and reported failure — the game, or horno's install pass. */
export class ChildExitError extends Error {
  constructor(readonly exitCode: number) {
    super(`exited with code ${exitCode}`);
    this.name = 'ChildExitError';
  }
}
