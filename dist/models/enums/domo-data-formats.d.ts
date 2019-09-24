/**
 * Supported `format` options for controlling the format
 * of the data returned from Domo.
 *
 * See [developer.domo.com](https://developer.domo.com/docs/dev-studio-references/data-api#Data%20Formats)
 * for more details.
 */
export declare enum DomoDataFormats {
    ARRAY_OF_OBJECTS = "array-of-objects",
    ARRAY_OF_ARRAYS = "array-of-arrays",
    EXCEL = "excel",
    CSV = "csv"
}
