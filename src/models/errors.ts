export class DomoError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DomoError';
  }
}

export class DomoHttpError extends DomoError {
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

export class DomoAuthError extends DomoHttpError {
  constructor(message: string, status: number, statusText: string, body: string, headers: Record<string, string>) {
    super(message, status, statusText, body, headers);
    this.name = 'DomoAuthError';
  }
}

export class DomoTimeoutError extends DomoError {
  public readonly url: string;

  constructor(message: string, url: string) {
    super(message);
    this.name = 'DomoTimeoutError';
    this.url = url;
  }
}

export class DomoValidationError extends DomoError {
  public readonly errors: unknown[];

  constructor(message: string, errors: unknown[] = []) {
    super(message);
    this.name = 'DomoValidationError';
    this.errors = errors;
  }
}

export class DomoConnectionError extends DomoError {
  constructor(message: string) {
    super(message);
    this.name = 'DomoConnectionError';
  }
}

export class DomoAbortError extends DomoError {
  constructor(message = 'Request aborted', options?: ErrorOptions) {
    super(message, options);
    this.name = 'DomoAbortError';
  }
}
