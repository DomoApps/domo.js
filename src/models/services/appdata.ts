import { generateUniqueId, isValidEchoRequestId } from "../../utils/general";
import { domoDebug } from "../../utils/debug";
import { OnAckCallback, OnReplyCallback } from "../interfaces/ask-reply";
import { DomoValidationError } from "../errors";

export interface AppDataUpdateOptions {
  /**
   * Opaque correlation id supplied by the embed host on a recent inbound
   * appData apply. When set, the SDK emits it as a separate `echoRequestId`
   * field on the outbound payload so the host can match the echo to its
   * original apply. Must match `^[A-Za-z0-9_\-:.]{1,128}$`.
   */
  echoRequestId?: string;
}

type AppDataPayload = {
  requestId: string;
  event: "appData";
  appData: string;
  echoRequestId?: string;
};

/**
 * Sends app data to the parent window.
 *
 * @this {Domo} - The Domo instance context.
 * @param appData - The app data to send, as a string.
 * @param onAck - Optional callback to invoke when the message is acknowledged.
 * @param onReply - Optional callback to invoke when a reply is received.
 * @param opts - Optional bag; `opts.echoRequestId` echoes a host correlation id back on the wire.
 */
export function requestAppDataUpdate(
  appData: string,
  onAck?: OnAckCallback,
  onReply?: OnReplyCallback,
  opts?: AppDataUpdateOptions,
) {
  if (opts?.echoRequestId !== undefined && !isValidEchoRequestId(opts.echoRequestId)) {
    console.error(
      "Domo: Invalid echoRequestId — must be a string of 1-128 chars matching [A-Za-z0-9_\\-:.]. Received:",
      opts.echoRequestId,
    );
    throw new DomoValidationError(
      'Invalid echoRequestId — must be a string of 1-128 chars matching [A-Za-z0-9_\\-:.]',
      [opts.echoRequestId],
    );
  }

  const requestId = generateUniqueId();

  const payload: AppDataPayload = {
    requestId,
    event: "appData",
    appData,
  };

  if (opts?.echoRequestId !== undefined) {
    payload.echoRequestId = opts.echoRequestId;
  }

  this.requests[requestId] = {
    request: {
      payload,
      onAck,
      onReply,
      status: "pending",
      sentAt: Date.now(),
    },
  };

  domoDebug.log('messages', 'sent:postMessage', 'appData', payload);
  window.parent.postMessage(JSON.stringify(payload), "*");
}

/**
 * Registers a callback to be invoked when app data is received.
 * NOTE: this references the Domo object, so it should be called in the context of Domo.
 *
 * @param callback - The function to call when app data is received.
 * @returns A function to unregister the callback.
 */
export function onAppDataUpdated(callback: (appData: string) => void) {
  this.connect(true);
  this.listeners.onAppDataUpdated.push(callback);

  return () => {
    const index = this.listeners.onAppDataUpdated.indexOf(callback);
    if (index >= 0) this.listeners.onAppDataUpdated.splice(index, 1);
  };
}

/**
 * Handles incoming app data messages and invokes registered callbacks.
 *
 * @param message - The message containing app data.
 * @param responsePort - Optional MessagePort to send the response back (for MessageChannel communication).
 * @returns void
 */
export function handleAppData(message: any, responsePort?: MessagePort) {
  if (!message) return;

  if (this.listeners.onAppDataUpdated.length) {
    const ack = { requestId: message.requestId, event: "ack" };
    domoDebug.log('messages', 'sent:ack:channel', 'ack', ack);
    responsePort?.postMessage(ack);
    this.listeners.onAppDataUpdated.forEach(
      (cb: (appData: string, requestId?: string) => void) =>
        cb(message.appData, message.requestId)
    );
  }

  this.handleReply(message.requestId, message.appData, message.error);
}
