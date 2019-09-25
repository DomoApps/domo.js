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