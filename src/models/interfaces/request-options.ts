import { DomoDataFormats } from './domo-data-formats';

/**
 * Options for HTTP requests to Domo endpoints.
 * @template F Format type, e.g. 'array-of-objects', 'csv', etc.
 */
export interface RequestOptions<F extends DomoDataFormats = DomoDataFormats> {
  /**
   * The format of the data to request.
   */
  format?: F;
  /**
   * The response type for XMLHttpRequest.
   */
  responseType?: XMLHttpRequestResponseType;
  /**
   * Optional custom fetch implementation.
   */
  fetch?: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  /**
   * Content-Type header value.
   */
  contentType?: string;
}
