import { DataFormats } from "../models/enums/data-formats";
import { DomoDataFormats } from "../models/interfaces/request";

/**
 * Converts a DomoDataFormats value to the corresponding DataFormats enum value for HTTP requests.
 *
 * @param format - The DomoDataFormats string to convert.
 * @returns The corresponding DataFormats enum value.
 */
export function domoFormatToRequestFormat(format: DomoDataFormats): DataFormats {
  switch (format) {
    case 'array-of-objects': return DataFormats.ARRAY_OF_OBJECTS;
    case 'array-of-arrays': return DataFormats.JSON;
    case 'excel': return DataFormats.EXCEL;
    case 'csv': return DataFormats.CSV;
    default: return DataFormats.ARRAY_OF_OBJECTS;
  }
}
