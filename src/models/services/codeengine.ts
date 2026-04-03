import { post } from "./http";
import { RequestOptions } from "../interfaces/request";

/**
 * Runs a Code Engine function by its alias and returns the output.
 *
 * The `functionAlias` corresponds to the `alias` in your app's `manifest.json`
 * `packageMapping` array.
 *
 * @param functionAlias - The alias of the Code Engine package as defined in manifest.json
 * @param input - An object of input parameters. Keys should match the parameter
 *                aliases defined in the packageMapping's `parameters` array.
 * @param options - Optional request options (e.g. custom fetch).
 * @returns A promise resolving to the Code Engine function's output.
 *
 * @example
 * // manifest.json packageMapping:
 * // [{ "alias": "awesomeFunction", "parameters": [{ "alias": "number1AppInput", ... }], "output": { ... } }]
 *
 * const result = await domo.codeEngine("awesomeFunction", { number1AppInput: 5, number2AppInput: 10 });
 *
 * @example
 * // With TypeScript generics for typed output:
 * const sum = await domo.codeEngine<number>("awesomeFunction", { number1AppInput: 5, number2AppInput: 10 });
 */
function codeEngine<T = any>(
  functionAlias: string,
  input?: Record<string, any>,
  options?: RequestOptions,
): Promise<T> {
  const handle = this?.post ?? post;
  return handle(
    `/domo/codeengine/v2/packages/${encodeURIComponent(functionAlias)}`,
    input ?? {},
    options,
  );
}

export { codeEngine };
