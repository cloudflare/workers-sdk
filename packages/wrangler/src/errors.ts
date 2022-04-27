export class DeprecationError extends Error {
  constructor(message: string) {
    super(`DEPRECATION:\n${message}`);
  }
}

export class FatalError extends Error {
  constructor(message?: string, readonly code?: number) {
    super(message);
  }
}
