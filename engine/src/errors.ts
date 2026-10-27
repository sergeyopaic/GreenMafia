/** Values substituted into a translated message (seat numbers, names, role ids, limits). */
export type Params = Record<string, string | number>;

/**
 * Why something is not allowed. `code` + `params` let the app show the text in any language;
 * `message` is the Russian text, kept for logs and as a fallback.
 */
export interface Reason {
  code: string;
  message: string;
  params?: Params;
}

/** A rule violation. */
export class RuleError extends Error {
  readonly code: string;
  readonly params: Params | undefined;

  constructor(code: string, message: string, params?: Params) {
    super(message);
    this.name = 'RuleError';
    this.code = code;
    this.params = params;
  }
}

export interface EngineError {
  code: string;
  /** Russian text; the app translates by `code` + `params`. */
  message: string;
  params?: Params;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: EngineError };

export function fail(code: string, message: string, params?: Params): never {
  throw new RuleError(code, message, params);
}

/** Throws a reason as an error with `code`; the detailed reason goes into `params.reason`. */
export function failWith(code: string, reason: Reason): never {
  throw new RuleError(code, reason.message, { ...(reason.params ?? {}), reason: reason.code });
}
