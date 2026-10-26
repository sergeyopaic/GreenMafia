/** A rule violation. `message` is shown to the host as is (Russian). */
export class RuleError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RuleError';
    this.code = code;
  }
}

export interface EngineError {
  code: string;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: EngineError };

export function fail(code: string, message: string): never {
  throw new RuleError(code, message);
}
