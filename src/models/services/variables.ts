import { generateUniqueId, isIOS, isMobile } from "../../utils/general";
import { guardAgainstInvalidVariables } from "../../utils/variable";
import { Variable } from "../interfaces/variable";

/**
 * Sends variables to the parent window or to the iOS webkit message handler.
 *
 * @this {Domo} - The Domo instance context.
 * @param variables - The variables to send, either as a stringified Variable[] or Variable[].
 * @param onAck - Optional callback to invoke when the message is acknowledged.
 * @param onReply - Optional callback to invoke when a reply is received.
 * @returns The request ID for tracking the request.
 */
export function requestVariablesUpdate(variables: string | Variable[], onAck?: Function, onReply?: Function): string {
  guardAgainstInvalidVariables(variables);
  const sanitizedVariables = typeof variables === 'string' ? JSON.parse(variables) : variables;
  const requestId = generateUniqueId();
  const ios = isIOS();
  const mobile = isMobile();
  const message = {
    requestId,
    event: "variable",
    variables: sanitizedVariables,
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

  if (!mobile) {
    window.parent.postMessage(JSON.stringify(message), "*");
    return requestId;
  }

  try {
    const messagePayload = typeof sanitizedVariables === 'string' ? sanitizedVariables : JSON.stringify(sanitizedVariables);
    domovariable.postMessage(messagePayload);
  }
  catch (err) {
    console.error("Failed to post message using domovariable:", err);
    try {
      if (ios) {
        const messagePayload = typeof sanitizedVariables === 'string' ? sanitizedVariables : JSON.stringify(sanitizedVariables);
        window.webkit?.messageHandlers?.domovariable?.postMessage(messagePayload);
      } else {
        window.parent.postMessage(JSON.stringify(message), "*");
      }
    } catch (error_) {
      console.error("Failed to post message using webkit:", error_);
      window.parent.postMessage(JSON.stringify(message), "*");
    }
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