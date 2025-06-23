import { DomoDataFormats, RequestOptions, QueryParams, RequestBody } from './request';

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
    type: DomoDataFormats;
    maxLength?: number;
    minLength?: number;
  }[];
  rows: (string | number | Date | null)[][];
}

export interface ObjectResponseBody {
  [columnName: string]: string | number | Date | null;
}