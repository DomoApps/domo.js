import { Variable } from "../models/interfaces/variable";
import { DomoValidationError } from "../models/errors";

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

const VARIABLE_EXAMPLE = {
  functionId: 1,
  value: "any value (string, number, etc.)",
};

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
    console.error("Domo: Variables string is not valid JSON. Received:", variables, "\nExpected format:", [VARIABLE_EXAMPLE]);
    throw new DomoValidationError('Variables string is not valid JSON.', [variables]);
  }

  if (!isVariableArray(parsedVariables)) {
    const items = Array.isArray(parsedVariables) ? parsedVariables : [parsedVariables];
    const invalid = Array.isArray(parsedVariables) ? parsedVariables.filter(v => !isVariable(v)) : items;
    console.error("Domo: Invalid variable(s) detected:", invalid, "\nExpected format:", VARIABLE_EXAMPLE);
    throw new DomoValidationError('Variables must be provided as a Variable array.', invalid);
  }

  if (parsedVariables.length === 0) {
    console.error("Domo: Variables array cannot be empty. Expected format:", [VARIABLE_EXAMPLE]);
    throw new DomoValidationError('Variables array cannot be empty.', []);
  }
}