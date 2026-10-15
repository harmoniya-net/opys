export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/** The game `opys` started ran and reported failure. */
export class ChildExitError extends Error {
  constructor(readonly exitCode: number) {
    super(`exited with code ${exitCode}`);
    this.name = 'ChildExitError';
  }
}
