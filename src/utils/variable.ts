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
 * Returns a list of specific reasons why a variable object is invalid.
 * Returns an empty array if the variable is valid.
 */
export function getVariableErrors(obj: any): string[] {
  const errors: string[] = [];
  if (obj === null || typeof obj !== 'object') {
    errors.push('Variable must be a non-null object.');
    return errors;
  }
  if (!obj.hasOwnProperty('functionId')) {
    errors.push('Missing required property "functionId".');
  } else if (typeof obj.functionId !== 'number') {
    errors.push(`"functionId" must be a number, received ${typeof obj.functionId} ("${obj.functionId}").`);
  }
  if (!obj.hasOwnProperty('value')) {
    errors.push('Missing required property "value".');
  }
  return errors;
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

  if (!Array.isArray(parsedVariables)) {
    console.error("Domo: Variables must be an array. Received:", parsedVariables, "\nExpected format:", [VARIABLE_EXAMPLE]);
    throw new DomoValidationError('Variables must be provided as a Variable array.', [parsedVariables]);
  }

  const invalidIndices: number[] = [];
  parsedVariables.forEach((v, i) => { if (!isVariable(v)) invalidIndices.push(i); });
  if (invalidIndices.length > 0) {
    const invalid = invalidIndices.map(i => parsedVariables[i]);
    const details = invalidIndices.map(i => {
      const reasons = getVariableErrors(parsedVariables[i]);
      return `  Variable at index ${i}: ${reasons.join(' ')}`;
    });
    const message = `Invalid variable(s) detected:\n${details.join('\n')}`;
    console.error(`Domo: ${message}`, "\nExpected format:", VARIABLE_EXAMPLE);
    throw new DomoValidationError(message, invalid);
  }

  if (parsedVariables.length === 0) {
    console.error("Domo: Variables array cannot be empty. Expected format:", [VARIABLE_EXAMPLE]);
    throw new DomoValidationError('Variables array cannot be empty.', []);
  }
}