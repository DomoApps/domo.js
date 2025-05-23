/**
 * Sends variables to the parent window or to the iOS webkit message handler.
 *
 * @param variables - The variables to send, as a string.
 */
export function sendVariables(variables: string) {
  const userAgent = window.navigator.userAgent.toLowerCase(),
    safari = /safari/.test(userAgent),
    ios = /iphone|ipod|ipad/.test(userAgent);
  const message = JSON.stringify({
    event: "variables",
    variables,
  });

  if (ios && !safari) {
    (window as any).webkit.messageHandlers.domovariable.postMessage(variables);
  } else {
    window.parent.postMessage(message, "*");
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