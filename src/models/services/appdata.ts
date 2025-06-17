/**
 * Sends app data to the parent window.
 *
 * @param appData - The app data to send, as a string.
 */
export function requestAppDataUpdate(appData: string) {
  const message = JSON.stringify({
    event: "appData",
    appData,
  });

  window.parent.postMessage(message, "*");
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
