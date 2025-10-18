import { Variable } from "../models/interfaces/variable";

/**
 * Type guard to check if an object is a valid Variable.
 * 
 * @param obj - The object to check
 * @returns True if the object is a valid Variable, false otherwise
 */
export function isVariable(obj: any): obj is Variable {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.functionId === 'number' &&
    obj.hasOwnProperty('value')
  );
}

/**
 * Type guard to check if an array contains valid Variables.
 * 
 * @param arr - The array to check
 * @returns True if the array contains only valid Variables, false otherwise
 */
export function isVariableArray(arr: any): arr is Variable[] {
  return Array.isArray(arr) && arr.every(isVariable);
}

/**
 * Guards against invalid variables being sent to Domo.
 *
 * @param variables string | Variable[] The variables to evaluate
 */
export function guardAgainstInvalidVariables(variables: string | Variable[]) {
  let parsedVariables = variables;

  try {
    if (typeof variables === 'string')
      parsedVariables = JSON.parse(variables);
  } catch (error) {
    throw new Error('Variables string is not valid JSON or a valid Variable array: { "functionId": number, "value": any }[]');
  }

  if (!isVariableArray(parsedVariables))
    throw new Error('Variables must be provided as a Variable array or a stringified Variable array: { "functionId": number, "value": any }[]');

  if (parsedVariables.length === 0)
    throw new Error('Variables array cannot be empty.');
}