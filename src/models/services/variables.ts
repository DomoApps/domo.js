import { generateUniqueId, isIOS } from "../../utils/general";

/**
 * Sends variables to the parent window or to the iOS webkit message handler.
 *
 * @this {Domo} - The Domo instance context.
 * @param variables - The variables to send, as a string.
 * @param onAck - Optional callback to invoke when the message is acknowledged.
 * @param onReply - Optional callback to invoke when a reply is received.
 * @returns void
 */
export function requestVariablesUpdate(variables: string, onAck?: Function, onReply?: Function) {
  const requestId = generateUniqueId();
  const ios = isIOS();
  const message = {
    requestId,
    event: "variable",
    variables,
  };

  this.requests[requestId] = {
    request: {
      payload: message,
      onAck,
      onReply,
      status: "pending",
      sentAt: Date.now(),
    },
  };

  if (!ios) {
    window.parent.postMessage(JSON.stringify(message), "*");
    return requestId;
  }

  try {
    if (typeof domovariable?.postMessage === 'function') {
      domovariable.postMessage(variables);
      return requestId;
    }

    window.webkit?.messageHandlers?.domovariable?.postMessage(variables);
  } catch (err) {
    console.error("Failed to post message to iOS handler:", err);
  }

  return requestId;
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
    if (index >= 0) this.listeners.onVariablesUpdated.splice(index, 1);
  };
}

/**
 * Handles the updated variables message.
 * 
 * @this {Domo} - The Domo instance context.
 * @param message - The message containing updated variables.
 * @param responsePort - The port to send the response back.
 * @returns void
 */
export function handleVariablesUpdated(message: any, responsePort?: MessagePort) {
  if (!message) return;
  
  if (this.listeners.onVariablesUpdated.length) {
    responsePort?.postMessage({ requestId: message.requestId, event: "ack", variables: message.variables });
    this.listeners.onVariablesUpdated.forEach((cb: Function) =>
      cb(message.variables)
    );
  }

  this.handleReply(message.requestId, message.variables, message.error);
}