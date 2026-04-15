/**
 * Base HTTP error thrown for non-2xx responses from Domo endpoints.
 */
export class DomoHttpError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly body: string;
  public readonly headers: Record<string, string>;

  constructor(message: string, status: number, statusText: string, body: string, headers: Record<string, string>) {
    super(message);
    this.name = 'DomoHttpError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
    this.headers = headers;
  }
}

/**
 * Thrown for 401/403 authentication or authorization failures.
 */
export class DomoAuthError extends DomoHttpError {
  constructor(message: string, status: number, statusText: string, body: string, headers: Record<string, string>) {
    super(message, status, statusText, body, headers);
    this.name = 'DomoAuthError';
  }
}

/**
 * Thrown when a request or message times out.
 */
export class DomoTimeoutError extends Error {
  public readonly url: string;

  constructor(message: string, url: string) {
    super(message);
    this.name = 'DomoTimeoutError';
    this.url = url;
  }
}

/**
 * Thrown when input validation fails — schema parsing, filter guards, variable guards.
 */
export class DomoValidationError extends Error {
  public readonly errors: unknown[];

  constructor(message: string, errors: unknown[] = []) {
    super(message);
    this.name = 'DomoValidationError';
    this.errors = errors;
  }
}

/**
 * Thrown when a network-level connection failure occurs (fetch rejects).
 */
export class DomoConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomoConnectionError';
  }
}
