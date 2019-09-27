/**
 * Supported `format` options for controlling the format
 * of the data returned from Domo.
 *
 * See [developer.domo.com](https://developer.domo.com/docs/dev-studio-references/data-api#Data%20Formats)
 * for more details.
 */

export type DomoDataFormats =
  | 'array-of-objects'
  | 'array-of-arrays'
  | 'excel'
  | 'csv';
