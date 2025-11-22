/**
 * Registers a callback to be invoked when a data update message is received.
 * Uses MessageChannel for event communication, matching the pattern of other event listeners.
 * NOTE: this references the Domo class, so it should be called in the context of that class.
 *
 * @param {(alias: string) => void} callback - Callback function to be called with the alias when a data update event occurs.
 * @returns {() => void} - Function to remove the registered callback.
 */
export function onDataUpdated(callback: (alias: string) => void) {
  this.connect(true);
  this.listeners.onDataUpdated.push(callback);

  return () => {
    const index = this.listeners.onDataUpdated.indexOf(callback);
    if (index >= 0) this.listeners.onDataUpdated.splice(index, 1);
  };
}

/**
 * Handles incoming data update messages and invokes registered callbacks.
 *
 * @this {Domo} - The Domo instance context.
 * @param message - The message containing data update information.
 * @param responsePort - Optional MessagePort to send the response back (for MessageChannel communication).
 * @returns void
 */
export function handleDataUpdated(message: any, responsePort?: MessagePort) {
  if (!message) return;

  if (this.listeners.onDataUpdated.length) {
    responsePort?.postMessage({ requestId: message.requestId, event: "ack", alias: message.alias });
    this.listeners.onDataUpdated.forEach((cb: Function) => cb(message.alias));
  }
}
