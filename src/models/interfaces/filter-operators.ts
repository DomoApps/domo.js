/**
 * Referenced from com/domo/api/content/client/views/model/Operator.java
 */
export enum FilterOperatorsString {
  IN = "IN",
  NOT_IN = "NOT_IN",
  CONTAINS = "CONTAINS",
  NOT_CONTAINS = "NOT_CONTAINS",
  STARTS_WITH = "STARTS_WITH",
  NOT_STARTS_WITH = "NOT_STARTS_WITH",
  ENDS_WITH = "ENDS_WITH",
  NOT_ENDS_WITH = "NOT_ENDS_WITH",
}

export enum FilterOperatorsNumeric {
  GREATER_THAN = 'GREATER_THAN',
  GREAT_THAN_EQUALS_TO = 'GREAT_THAN_EQUALS_TO',
  LESS_THAN = 'LESS_THAN',
  LESS_THAN_EQUALS_TO = 'LESS_THAN_EQUALS_TO',
  BETWEEN = 'BETWEEN',
  EQUALS = 'EQUALS',
  NOT_EQUALS = 'NOT_EQUALS'
}
