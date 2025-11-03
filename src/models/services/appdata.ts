import { generateUniqueId } from "../../utils/general";

/**
 * Sends app data to the parent window.
 *
 * @this {Domo} - The Domo instance context.
 * @param appData - The app data to send, as a string.
 * @param onAck - Optional callback to invoke when the message is acknowledged.
 * @param onReply - Optional callback to invoke when a reply is received.
 */
export function requestAppDataUpdate(appData: string, onAck?: Function, onReply?: Function) {
  const requestId = generateUniqueId();

  const payload = {
    requestId,
    event: "appData",
    appData,
  };

  this.requests[requestId] = {
    request: {
      payload,
      onAck,
      onReply,
      status: "pending",
      sentAt: Date.now(),
    },
  };

  window.parent.postMessage(JSON.stringify(payload), "*");
}

/**
 * Registers a callback to be invoked when app data is received.
 * NOTE: this references the Domo object, so it should be called in the context of Domo.
 *
 * @param callback - The function to call when app data is received.
 * @returns A function to unregister the callback.
 */
export function onAppDataUpdated(callback: Function) {
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
    responsePort?.postMessage({ requestId: message.requestId, event: "ack" });
    this.listeners.onAppDataUpdated.forEach((cb: Function) =>
      cb(message.appData)
    );
  }

  this.handleReply(message.requestId, message.appData, message.error);
}
