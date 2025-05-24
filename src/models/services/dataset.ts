/**
 * Creates a message event listener for data update events, verifying the origin and parsing the message.
 * Calls all provided listeners with the alias from the message and sends an acknowledgement back to the source.
 *
 * @param {Function[]} listeners - Array of callback functions to be called with the alias when a valid message is received.
 * @param {(origin: string) => boolean} isVerifiedOrigin - Function to verify the origin of the message event.
 * @returns {(event: MessageEvent) => void} - The event listener function to be used with window.addEventListener.
 */
export function sharedOnDataUpdateListener(listeners: Function[], isVerifiedOrigin: (origin: string) => boolean) {
  return function(event: MessageEvent) {
    if (!isVerifiedOrigin(event.origin)) return;
    if (typeof event.data === "string" && event.data.length > 0) {
      try {
        const message = JSON.parse(event.data);
        if (!message.hasOwnProperty("alias")) {
          return;
        }
        const alias = message.alias;
        const ack = JSON.stringify({ event: "ack", alias });
        if (event.source && typeof event.source.postMessage === 'function') {
          (event.source as any).postMessage(ack, event.origin);
        }
        listeners.forEach(cb => cb(alias));
      } catch (err) {
        const info =
          "There was an error in onDataUpdated! It may be that our event listener caught " +
          "a message from another source and tried to parse it, so your update still may have worked. " +
          "If you would like more info, here is the error: \n";
        if (process?.env?.NODE_ENV !== 'test')
          console.warn(info, err);
      }
    }
  }
}

/**
 * Registers a callback to be invoked when a data update message is received.
 * Adds the callback to the listeners array and manages the message event listener lifecycle.
 * NOTE: this references the Domo class, so it should be called in the context of that class.
 *
 * @param {(alias: string) => void} cb - Callback function to be called with the alias when a data update event occurs.
 * @returns {() => void} - Function to remove the registered callback.
 */
export function onDataUpdated(cb: (alias: string) => void) {
  if (typeof cb !== 'function') return () => {};
  if (!this._onDataUpdateListener) {
    this._onDataUpdateListener = this._sharedOnDataUpdateListener;
    window.addEventListener("message", this._onDataUpdateListener);
  }

  this.listeners.onDataUpdated.push(cb);
  return () => {
    const arr = this.listeners.onDataUpdated;
    const idx = arr.indexOf(cb);
    if (idx !== -1) arr.splice(idx, 1);
    if (arr.length === 0 && this._onDataUpdateListener) {
      window.removeEventListener("message", this._onDataUpdateListener);
      this._onDataUpdateListener = null;
    }
  };
}