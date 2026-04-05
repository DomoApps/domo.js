import { generateUniqueId } from "../../utils/general";
import { sendToParent } from "../../utils/messaging";
import { guardAgainstInvalidVariables } from "../../utils/variable";
import { Variable } from "../interfaces/variable";
import { OnAckCallback, OnReplyCallback } from "../interfaces/ask-reply";
import { domoDebug } from "../../utils/debug";

/**
 * Sends variables to the parent window or to the iOS webkit message handler.
 *
 * @this {Domo} - The Domo instance context.
 * @param variables - The variables to send, either as a stringified Variable[] or Variable[].
 * @param onAck - Optional callback to invoke when the message is acknowledged.
 * @param onReply - Optional callback to invoke when a reply is received.
 * @returns The request ID for tracking the request.
 */
export function requestVariablesUpdate(variables: string | Variable[], onAck?: OnAckCallback, onReply?: OnReplyCallback): string {
  guardAgainstInvalidVariables(variables);
  const sanitizedVariables = typeof variables === 'string' ? JSON.parse(variables) : variables;
  const requestId = generateUniqueId();
  const desktopPayload = {
    requestId,
    event: "variable",
    variables: sanitizedVariables,
  };

  this.requests[requestId] = {
    request: {
      payload: desktopPayload,
      onAck,
      onReply,
      status: "pending",
      sentAt: Date.now(),
    },
  };

  const stringifiedVariables = JSON.stringify(sanitizedVariables);

  sendToParent(
    'variable',
    desktopPayload,
    'domovariable',
    stringifiedVariables,
    stringifiedVariables
  );

  return requestId;
}

/**
 * Registers a callback to be invoked when variables are updated.
 * NOTE: this references the Domo object, so it should be called in the context of Domo.
 *
 * @param callback - The function to call when variables are updated.
 * @returns A function to unregister the callback.
 */
export function onVariablesUpdated(callback: (variables: Variable[]) => void) {
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
    domoDebug.log('variables', 'variablesUpdated', message.variables);
    const ack = { requestId: message.requestId, event: "ack", variables: message.variables };
    domoDebug.log('messages', 'sent:ack:channel', 'ack', ack);
    responsePort?.postMessage(ack);
    this.listeners.onVariablesUpdated.forEach((cb: (variables: Variable[]) => void) =>
      cb(message.variables)
    );
  }

  this.handleReply(message.requestId, message.variables, message.error);
}