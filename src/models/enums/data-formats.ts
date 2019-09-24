/**
 * Supported `accept` headers for controlling the format
 * of the data returned from Domo.
 *
 * See [developer.domo.com](https://developer.domo.com/docs/dev-studio-references/data-api#Data%20Formats)
 * for more details.
 */
export enum DataFormats {
  DEFAULT = 'application/array-of-objects',
  ARRAY_OF_OBJECTS = 'application/array-of-objects',
  JSON = 'application/json',
  CSV = 'text/csv',
  EXCEL = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  PLAIN = 'text/plain'
}