/**
 * Sends app data to the parent window.
 *
 * @param appData - The app data to send, as a string.
 */
export function sendAppData(appData: string) {
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
export function onAppData(callback: Function) {
  this.connect(true);
  this.listeners.onAppData.push(callback);

  return () => {
    const index = this.listeners.onAppData.indexOf(callback);
    this.listeners.onAppData.splice(index, 1);
  };
};