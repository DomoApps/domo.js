/**
 * Interface representing a Domo variable.
 */
export interface Variable {
  /** The function ID associated with the variable */
  functionId: number;
  /** The value of the variable, can be any type */
  value: any;
}