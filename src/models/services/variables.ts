/**
 * Sends variables to the parent window or to the iOS webkit message handler.
 *
 * @param variables - The variables to send, as a string.
 */
export function sendVariables(variables: string) {
  const userAgent = window.navigator.userAgent.toLowerCase();
  const ios = /iphone|ipod|ipad/.test(userAgent);
  const message = JSON.stringify({
    event: "variables",
    variables,
  });

  if (!ios)
    return window.parent.postMessage(message, window.origin);

  if (typeof (window as any).webkit?.messageHandlers?.domovariable?.postMessage === "function") {
    try {
      (window as any).webkit.messageHandlers.domovariable.postMessage(variables);
    } catch (err) {
      console.error("Failed to post message to iOS handler:", err);
    }
  }
}

/**
 * Registers a callback to be invoked when variables are updated.
 * NOTE: this references the Domo object, so it should be called in the context of Domo.
 *
 * @param callback - The function to call when variables are updated.
 * @returns A function to unregister the callback.
 */
export function onVariablesUpdated(callback: Function) {
  this.connect(true);
  this.listeners.onVariablesUpdated.push(callback);

  return () => {
    const index = this.listeners.onVariablesUpdated.indexOf(callback);
    this.listeners.onVariablesUpdated.splice(index, 1);
  };
};