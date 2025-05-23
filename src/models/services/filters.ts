import { Filter } from "../interfaces/filter";

export function filterContainer(
  filters: Filter[] | null,
  pageStateUpdate: boolean | null = null
): void {
  const userAgent = window.navigator.userAgent.toLowerCase(),
    safari = /safari/.test(userAgent),
    ios = /iphone|ipod|ipad/.test(userAgent);

  const message = JSON.stringify({
    event: "filter",
    filter: filters?.map((filter) => ({
      columnName: filter.column,
      operator: filter.operator ?? (filter as any).operand,
      values: filter.values,
      dataType: filter.dataType,
    })),
    pageStateUpdate,
  });

  if (ios && !safari) {
    (window as any).webkit.messageHandlers.domofilter.postMessage(
      filters?.map((filter) => ({
        column: filter.column,
        operand: filter.operator || (filter as any).operand,
        values: filter.values,
        dataType: filter.dataType,
      }))
    );
  } else {
    window.parent.postMessage(message, "*");
  }
}
