/**
 * These are pulled directly from the backend code,
 * which is not consistent in naming styles
 */

export enum FilterOperators {
  IS = 'is',
  IS_NOT = 'is not',
  IN = 'IN',
  NOT_IN = 'NOT_IN',
  IS_GREATER_THAN = 'is greater than',
  IS_ABOVE_AVERAGE = 'is above average',
  IS_GREATER_THAN_OR_EQUAL_TO = 'is greater than or equal to',
  IS_LESS_THAN = 'is less than',
  IS_BELOW_AVERAGE = 'is below average',
  IS_LESS_THAN_OR_EQUAL_TO = 'is less than or equal to',
  IS_BETWEEN = 'is between',
  IS_NOT_BETWEEN = 'is not between',
  LIKE = 'like',
  NOT_LIKE = 'not like',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not contains',
  STARTS_WITH = 'starts with',
  NOT_STARTS_WITH = 'not starts with',
  ENDS_WITH = 'ends with',
  NOT_ENDS_WITH = 'not ends with',
}
