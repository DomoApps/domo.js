import { DomoDataFormats } from './domo-data-formats';

export interface RequestOptions {
  format?: DomoDataFormats;
  responseType?: XMLHttpRequestResponseType;
  [index: string]: string | undefined;
}

export interface ObjectRequestOptions extends RequestOptions {
  format: 'array-of-objects';
}

export interface ArrayRequestOptions extends RequestOptions {
  format: 'array-of-arrays';
}
