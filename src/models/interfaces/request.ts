/**
 * Supported `format` options for controlling the format
 * of the data returned from Domo.
 *
 * See [developer.domo.com](https://developer.domo.com/docs/dev-studio-references/data-api#Data%20Formats)
 * for more details.
 */
export type DomoDataFormats =
  | 'array-of-objects'
  | 'array-of-arrays'
  | 'excel'
  | 'csv';

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

/**
 * Query parameters for Domo requests.
 *
 * If you know all possible query params, add them here. Otherwise, use the index signature for flexibility.
 */
export interface QueryParams {
  userId?: string | number;
  userName?: string;
  userEmail?: string;
  customer?: string;
  locale?: string;
  environment?: string;
  platform?: 'desktop' | 'mobile';
  // ...add more known params as needed
  [key: string]: string | number | undefined;
}

/**
 * This is from the XMLHttpRequest Documentation:
 * https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/send
 * 2021/10/28: XMLHttpRequest type was added to official Typescript types, using that instead.
 */
export type RequestBody = unknown;

import { DomoDataTypes } from '../enums/domo-data-types';
import { Json } from './json';

/**
 * This comes from the documentation:
 * https://developer.domo.com/docs/dev-studio-references/data-api
 */
export interface ArrayResponseBody {
  columns: string[],
  datasource: string;
  device: string;
  duration: string;
  fromcache: 'true' | 'false';
  queryUrl: string;
  numColumns: number;
  numRows: number;
  metadata: {
    dataSourceId: string;
    type: DomoDataTypes;
    maxLength?: number;
    minLength?: number;
  }[];
  rows: (string | number | Date | null)[][];
}

export interface ObjectResponseBody {
  [columnName: string]: string | number | Date | null;
}

export type ResponseBody =
  | Json
  | Blob
  | ArrayResponseBody
  | ObjectResponseBody[];