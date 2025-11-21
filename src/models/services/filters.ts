import { generateUniqueId, isIOS, isMobile } from "../../utils/general";
import { guardAgainstInvalidFilters } from "../../utils/filter";
import { Filter } from "../interfaces/filter";

/**
 * Sends filter data to the parent window or to the iOS webkit message handler.
 *
 * @this {Domo} - The Domo instance context.
 * @param filters - An array of Filter objects or null.
 * @param pageStateUpdate - Optional boolean indicating if the page state should be updated.
 * @param onAck - Callback function to be called when the filters are acknowledged.
 * @param onReply - Callback function to be called when the filters are replied.
 */
export function requestFiltersUpdate(
  filters: Filter[] | null,
  pageStateUpdate: boolean | null = null,
  onAck?: Function,
  onReply?: Function
): string {
  guardAgainstInvalidFilters(filters);
  const requestId = generateUniqueId();
  const ios = isIOS();
  const mobile = isMobile();

  const request = {
    requestId,
    event: "filter",
    filter: filters?.map((filter) => ({
      columnName: filter.column,
      operator: filter.operator ?? (filter as any).operand,
      values: filter.values,
      dataType: filter.dataType,
    })),
    pageStateUpdate,
  };

  this.requests[requestId] = {
    request: {
      payload: request,
      onAck,
      onReply,
      status: "pending",
      sentAt: Date.now(),
    },
  };

  if (!mobile) {
    window.parent.postMessage(JSON.stringify(request), "*");
    return request.requestId;
  }

  const sanitizedFilters = filters?.map((filter) => ({
    column: filter.column,
    operand: filter.operator || (filter as any).operand,
    values: filter.values,
    dataType: filter.dataType,
  }));


  try {
    domofilter.postMessage(JSON.stringify(sanitizedFilters));
  } catch (error_) {
    console.error("Failed to post message using domofilter:", error_);
    try {
      if (ios) window.webkit?.messageHandlers?.domofilter?.postMessage(sanitizedFilters);
      else window.parent.postMessage(JSON.stringify(request), "*");
    } catch (err) {
      console.error("Failed to post message using webkit:", err);
      window.parent.postMessage(JSON.stringify(request), "*");
    }
  }

  return requestId;
}

/**
 * Registers a callback to be invoked when filters are updated.
 * NOTE: this references the Domo object, so it should be called in the context of Domo.
 *
 * @this {Domo} - The Domo instance context.
 * @param callback - The function to call when filters are updated.
 * @returns A function to unregister the callback.
 */
export function onFiltersUpdated(callback: Function) {
  const hasHandlers = this.listeners.onFiltersUpdated.length > 0;

  this.connect();
  this.listeners.onFiltersUpdated.push(callback);
  if (!hasHandlers)
    this.requestFiltersUpdate(null, false);

  return () => {
    const index = this.listeners.onFiltersUpdated.indexOf(callback);
    if (index >= 0) this.listeners.onFiltersUpdated.splice(index, 1);
  };
}

/**
 * Handles the updated filters message.
 * 
 * @this {Domo} - The Domo instance context.
 * @param message - The message containing updated filters.
 * @param responsePort - The port to send the response back.
 * @returns void
 */
export function handleFiltersUpdated(message: any, responsePort?: MessagePort): void {
  if (!message) return;

  if (this.listeners.onFiltersUpdated.length) {
    responsePort?.postMessage({ requestId: message.requestId, event: "ack", filters: message.filters });
    this.listeners.onFiltersUpdated.forEach((cb: Function) =>
      cb(message.filters)
    );
  }

  this.handleReply(message.requestId, message.filters, message.error);
}
