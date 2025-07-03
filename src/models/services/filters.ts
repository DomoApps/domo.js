import { Filter } from "../interfaces/filter";

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        domofilter?: {
          postMessage?: (message: any) => void;
        };
      };
    };
  }
}

/**
 * Sends filter data to the parent window or to the iOS webkit message handler.
 *
 * @param filters - An array of Filter objects or null.
 * @param pageStateUpdate - Optional boolean indicating if the page state should be updated.
 * @param onAck - Callback function to be called when the filters are acknowledged.
 * @param onReply - Callback function to be called when the filters are replied.
 */
export function requestFiltersUpdate(
  filters: Filter[] | null,
  pageStateUpdate: boolean | null = null,
  onAck: (filters: Filter[] | null) => void = () => {},
  onReply: (filters: Filter[] | null) => void = () => {}
): void {
  const requestId = Math.random().toString(36).slice(2);
  if (onAck) this.ackCallbacks[requestId] = onAck;
  if (onReply) this.replyCallbacks[requestId] = onReply;

  const userAgent = window.navigator.userAgent.toLowerCase();
  const ios = /iphone|ipod|ipad/.test(userAgent);

  const message = JSON.stringify({
    event: "filter", // <-- Old way: Support for legacy systems
    type: "ASK",
    action: "filtersUpdate",
    requestId,
    filter: filters?.map((filter) => ({
      columnName: filter.column,
      operator: filter.operator ?? (filter as any).operand,
      values: filter.values,
      dataType: filter.dataType,
    })),
    pageStateUpdate,
  });

  if (
    ios &&
    typeof window.webkit?.messageHandlers?.domofilter?.postMessage ===
      "function"
  ) {
    try {
      window.webkit.messageHandlers.domofilter.postMessage(
        filters?.map((filter) => ({
          column: filter.column,
          operand: filter.operator || (filter as any).operand,
          values: filter.values,
          dataType: filter.dataType,
        }))
      );
    } catch (err) {
      console.error("Failed to post message to iOS handler:", err);
    }
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
    if (index >= 0) this.listeners.onFiltersUpdated.splice(index, 1);
  };
}
