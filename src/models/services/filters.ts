import { Filter } from "../interfaces/filter";

/**
 * Sends filter data to the parent window or to the iOS webkit message handler.
 *
 * @param filters - An array of Filter objects or null.
 * @param pageStateUpdate - Optional boolean indicating if the page state should be updated.
 */
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

/**
 * Registers a callback to be invoked when filters are updated.
 * NOTE: this references the Domo object, so it should be called in the context of Domo.
 *
 * @param callback - The function to call when filters are updated.
 * @returns A function to unregister the callback.
 */
export function onFiltersUpdated(callback: Function) {
  this.connect();
  this.listeners.onFiltersUpdated.push(callback);

  return () => {
    const index = this.listeners.onFiltersUpdated.indexOf(callback);
    this.listeners.onFiltersUpdated.splice(index, 1);
  };
};