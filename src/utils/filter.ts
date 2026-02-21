import { Filter, FilterDataTypes, FilterOperatorsString, FilterOperatorsNumeric } from "../models/interfaces/filter";

/**
 * Type guard to check if an object is a valid Filter.
 * 
 * @param obj - The object to check
 * @returns True if the object is a valid Filter, false otherwise
 */
export function isFilter(obj: any): obj is Filter {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.column === 'string' &&
    (obj.hasOwnProperty('operator') || obj.hasOwnProperty('operand')) &&
    Array.isArray(obj.values) &&
    obj.hasOwnProperty('dataType') &&
    (
      Object.values(FilterDataTypes).includes(obj.dataType) ||
      (typeof obj.dataType === 'string' && ['NUMERIC', 'DATE', 'DATETIME', 'STRING'].includes(obj.dataType.toUpperCase()))
    ) &&
    (
      Object.values(FilterOperatorsString).includes(obj.operator || obj.operand) ||
      Object.values(FilterOperatorsNumeric).includes(obj.operator || obj.operand) ||
      (typeof (obj.operator || obj.operand) === 'string' && 
       ['IN', 'NOT_IN', 'CONTAINS', 'NOT_CONTAINS', 'STARTS_WITH', 'NOT_STARTS_WITH', 'ENDS_WITH', 'NOT_ENDS_WITH',
        'GREATER_THAN', 'GREAT_THAN_EQUALS_TO', 'LESS_THAN', 'LESS_THAN_EQUALS_TO', 'BETWEEN', 'EQUALS', 'NOT_EQUALS'].includes((obj.operator || obj.operand).toUpperCase()))
    )
  );
}

/**
 * Type guard to check if an array contains valid Filters.
 * 
 * @param arr - The array to check
 * @returns True if the array contains only valid Filters, false otherwise
 */
export function isFilterArray(arr: any): arr is Filter[] {
  return Array.isArray(arr) && arr.every(isFilter);
}

/**
 * Guards against invalid filters being sent to Domo.
 *
 * @param filters Filter[] | null The filters to evaluate
 */
export function guardAgainstInvalidFilters(filters: Filter[] | null) {
  if (filters === null) return; // null is allowed

  if (!Array.isArray(filters))
    throw new TypeError('Filters must be provided as a Filter array or null: { "column": string, "operator": string, "values": any[], "dataType": string }[]');

  if (filters.length === 0) return; // empty array is allowed (clears all filters)

  if (!isFilterArray(filters))
    throw new TypeError('All filters must be valid Filter objects with required properties: { "column": string, "operator": string, "values": any[], "dataType": string }[]');
}