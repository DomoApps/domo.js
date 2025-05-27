import { DomoDataFormats } from './domo-data-formats';

type fetchType = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

export interface RequestOptions {
  format?: DomoDataFormats;
  responseType?: XMLHttpRequestResponseType;
  fetch?: fetchType;
  contentType?: string;
  [key: string]: unknown;
}

export interface ObjectRequestOptions extends RequestOptions {
  format: 'array-of-objects';
}

export interface ArrayRequestOptions extends RequestOptions {
  format: 'array-of-arrays';
}
