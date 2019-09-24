import { DomoDataFormats } from '../enums/domo-data-formats';

export interface RequestOptions {
  format?: DomoDataFormats;
  responseType?: XMLHttpRequestResponseType;
  [index: string]: string;
}
