import { DomoDataFormats, DataFormats } from '../models';

export function domoFormatToRequestFormat(format: DomoDataFormats): DataFormats {
  switch (format) {
    case DomoDataFormats.ARRAY_OF_OBJECTS: {
      return DataFormats.ARRAY_OF_OBJECTS;
    }
    case DomoDataFormats.ARRAY_OF_ARRAYS: {
      return DataFormats.JSON;
    }
    case DomoDataFormats.EXCEL: {
      return DataFormats.EXCEL;
    }
    case DomoDataFormats.CSV: {
      return DataFormats.CSV;
    }
    default: {
      return DataFormats.DEFAULT;
    }
  }
}
