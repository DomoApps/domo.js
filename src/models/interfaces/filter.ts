import { FilterDataTypes } from "./filter-data-types";
import { FilterOperatorsNumeric, FilterOperatorsString } from "./filter-operators";

/**
 * Base interface for all filters.
 */
interface BaseFilter<T, O, D> {
  /** The column to filter on. */
  column: string;
  /** The operator to use. */
  operator: O;
  /** The values to filter by. */
  values: T[];
  /** The data type of the column. */
  dataType: D;
}

/**
 * Filter type for Domo data queries.
 */
export type Filter =
  | BaseFilter<Date, FilterOperatorsNumeric, FilterDataTypes.DATE | FilterDataTypes.DATETIME>
  | BaseFilter<number, FilterOperatorsNumeric, FilterDataTypes.NUMERIC>
  | BaseFilter<string, FilterOperatorsString, FilterDataTypes.STRING>;