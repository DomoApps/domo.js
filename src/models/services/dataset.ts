// Handles dataset change logic (onDataUpdate)

function sharedOnDataUpdateListener(listeners: Function[], isVerifiedOrigin: (origin: string) => boolean) {
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
          "There was an error in onDataUpdate! It may be that our event listener caught " +
          "a message from another source and tried to parse it, so your update still may have worked. " +
          "If you would like more info, here is the error: \n";
        if (process?.env?.NODE_ENV !== 'test')
          console.warn(info, err);
      }
    }
  }
}

export { sharedOnDataUpdateListener };