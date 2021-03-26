import { FilterDataTypes } from "./filter-data-types";
import { FilterOperatorsNumeric, FilterOperatorsString } from "./filter-operators";

export type Filter = (
  | {
    column: string;
    operator: FilterOperatorsNumeric;
    values: Date[];
    dataType: FilterDataTypes.DATE | FilterDataTypes.DATETIME;
  }
  | {
    column: string;
    operator: FilterOperatorsNumeric;
    values: number[];
    dataType: FilterDataTypes.NUMERIC;
  }
  | {
    column: string;
    operator: FilterOperatorsString;
    values: string[];
    dataType: FilterDataTypes.STRING;
  }
);