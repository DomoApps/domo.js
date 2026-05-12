import { generateUniqueId } from "../../utils/general";
import { sendToParent } from "../../utils/messaging";
import { guardAgainstInvalidFilters } from "../../utils/filter";
import { Filter } from "../interfaces/filter";
import { OnAckCallback, OnReplyCallback } from "../interfaces/ask-reply";
import { domoDebug } from "../../utils/debug";

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
  onAck?: OnAckCallback,
  onReply?: OnReplyCallback
): string {
  guardAgainstInvalidFilters(filters);
  const requestId = generateUniqueId();

  const desktopPayload = {
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
      payload: desktopPayload,
      onAck,
      onReply,
      status: "pending",
      sentAt: Date.now(),
    },
  };

  const mobileFilters = filters?.map((filter) => ({
    column: filter.column,
    operand: filter.operator || (filter as any).operand,
    values: filter.values,
    dataType: filter.dataType,
  }));

  sendToParent(
    'filter',
    desktopPayload,
    'domofilter',
    JSON.stringify(mobileFilters),
    mobileFilters
  );

  return requestId;
}

/**
 * Registers a callback to be invoked when filters are updated.
 * NOTE: this references the Domo object, so it should be called in the context of Domo.
 *
 * Initial filter state is delivered via the SUBSCRIBE replay (sent by `connect()`
 * with `skipFilters: false`). The SDK intentionally does not emit a follow-up
 * `requestFiltersUpdate(null, false)` — DomoWeb interprets a null-filter request
 * as a page-level clear, which wipes active Pfilters / FilterView selections
 * (see DOMO-483920).
 *
 * @this {Domo} - The Domo instance context.
 * @param callback - The function to call when filters are updated.
 * @returns A function to unregister the callback.
 */
export function onFiltersUpdated(callback: (filters: Filter[]) => void) {
  this.connect();
  this.listeners.onFiltersUpdated.push(callback);

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
    domoDebug.log('filters', 'filtersUpdated', message.filters);
    const ack = { requestId: message.requestId, event: "ack", filters: message.filters };
    domoDebug.log('messages', 'sent:ack:channel', 'ack', ack);
    responsePort?.postMessage(ack);
    this.listeners.onFiltersUpdated.forEach(
      (cb: (filters: Filter[], requestId?: string) => void) =>
        cb(message.filters, message.requestId)
    );
  }

  this.handleReply(message.requestId, message.filters, message.error);
}
