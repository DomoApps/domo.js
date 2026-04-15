/**
 * The handleAck function acknowledges a request by its ID.
 * It updates the request status to "acknowledged" and records the acknowledgment time.
 * If the request is not found or is not in "pending" status, it logs a warning.
 *
 * @this {Domo} - The Domo instance containing the requests map.
 * @param requestId - The ID of the request to acknowledge.
 * @returns void
 */
export function handleAck(data: any, responsePort: MessagePort) {
  const { requestId } = data;
  if (!requestId) return;

  const entry = this.requests[requestId];
  if (!entry) return; // No matching request — this is a host-initiated push, not a reply

  // Skip if the request has already moved past pending (ack arrived after reply, or duplicate ack)
  if (entry.request.status !== "pending") {
    return;
  }

  entry.request.status = "acknowledged";
  entry.request.ackAt = Date.now();
  entry.request.onAck?.(entry.request.payload);
}

/**
 * The handleReply function processes a reply to a request by its ID.
 * It updates the request status to "fulfilled" or "rejected" based on the presence
 * of an error, records the reply time, and invokes the onReply callback if provided.
 * If the request is not found or is not acknowledged, it logs a warning.
 *
 * @this {Domo} - The Domo instance containing the requests map.
 * @param requestId - The ID of the request to reply to.
 * @param payload - The payload of the reply.
 * @param error - An optional error object if the reply is rejected.
 * @returns void
 */
export function handleReply(requestId: string, payload: any, error?: Error) {
  if (!requestId) return;

  const entry = this.requests[requestId];
  if (!entry) return; // No matching request — this is a host-initiated push, not a reply

  // A reply can arrive without a separate ack (the reply itself serves as ack+reply).
  // Only warn if the request has already been finalized.
  if (entry.request.status === "fulfilled" || entry.request.status === "rejected") {
    console.warn(
      `Request ${requestId} already finalized, current status: ${entry.request.status}`
    );
    return;
  }

  const status = error ? "rejected" : "fulfilled";
  const repliedAt = Date.now();

  entry.request.status = status;
  entry.request.repliedAt = repliedAt;
  entry.response = {
    payload,
    status,
    error,
    repliedAt,
  };

  entry.request.onReply?.(payload, error);
}