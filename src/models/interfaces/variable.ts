/**
 * Interface representing a Domo variable.
 *
 * Apps can identify a variable by either `functionId` (numeric) or `name`
 * (the human-readable display name). At least one of `functionId` or `name`
 * must be provided.
 */
export interface Variable {
  /** The function ID associated with the variable */
  functionId?: number;
  /** The human-readable name of the variable */
  name?: string;
  /** The value of the variable, can be any type */
  value: any;
}