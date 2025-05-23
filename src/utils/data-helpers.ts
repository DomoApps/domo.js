import { DataFormats } from "../models/enums/data-formats";
import { DomoDataFormats } from "../models/interfaces/domo-data-formats";

export function domoFormatToRequestFormat(format: DomoDataFormats): DataFormats {
  switch (format) {
    case 'array-of-objects': {
      return DataFormats.ARRAY_OF_OBJECTS;
    }
    case 'array-of-arrays': {
      return DataFormats.JSON;
    }
    case 'excel': {
      return DataFormats.EXCEL;
    }
    case 'csv': {
      return DataFormats.CSV;
    }
    default: {
      return DataFormats.DEFAULT;
    }
  }
}
