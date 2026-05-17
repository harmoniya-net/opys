export class NetworkError extends Error {
  readonly kind = 'network' as const;
  constructor(
    readonly url: string,
    readonly status: number,
    body: string,
  ) {
    super(`HTTP ${status} downloading ${url}${body ? ` — ${body}` : ''}`);
    this.name = 'NetworkError';
  }
}

export class IntegrityError extends Error {
  readonly kind = 'integrity' as const;
  constructor(readonly paths: string[]) {
    super(`Integrity check failed: ${paths.join(', ')}`);
    this.name = 'IntegrityError';
  }
}

export class ExtractionError extends Error {
  readonly kind = 'extraction' as const;
  constructor(
    readonly artifactPath: string,
    options?: ErrorOptions,
  ) {
    super(`Failed to extract ${artifactPath}`, options);
    this.name = 'ExtractionError';
  }
}

export type InstallError = NetworkError | IntegrityError | ExtractionError;
