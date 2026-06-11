export interface BroadcastMessage {
  topic: string;
  payload: unknown;
  sourceAppId: string;
  timestamp: number;
}

export type BroadcastCallback = (msg: BroadcastMessage) => void;

// Module state
let _appBroadcastingEnabled: boolean | null = null;
let _warnedNotEnabled = false;
let _manifestPromise: Promise<{ publishes?: string[]; subscribes?: string[] } | null> | null = null;

export const _subscriptions = new Map<string, Set<BroadcastCallback>>();

export function handleCapabilities(data: { appBroadcasting?: boolean }): void {
  _appBroadcastingEnabled = data.appBroadcasting === true;
}

export function handleBusMessage(data: {
  topic: string;
  payload: unknown;
  sourceAppId: string;
  timestamp?: number;
}): void {
  const callbacks = _subscriptions.get(data.topic);
  if (!callbacks) return;
  const msg: BroadcastMessage = {
    topic: data.topic,
    payload: data.payload,
    sourceAppId: data.sourceAppId,
    timestamp: data.timestamp ?? Date.now(),
  };
  for (const cb of callbacks) {
    cb(msg);
  }
}

export function handleBusError(data: {
  code: string;
  message: string;
  topic?: string;
}): void {
  const topicPart = data.topic ? ` (topic: ${data.topic})` : '';
  console.warn(`[domo.broadcast] Host error: ${data.code} — ${data.message}${topicPart}`);
}

export function __resetForTesting(): void {
  _appBroadcastingEnabled = null;
  _warnedNotEnabled = false;
  _manifestPromise = null;
  _subscriptions.clear();
}

// --- Helpers ---

function validateTopic(topic: string): void {
  if (topic.startsWith('domo:')) {
    throw new Error(`Topics starting with "domo:" are reserved and cannot be used.`);
  }
}

function getByteLength(str: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).byteLength;
  }
  // Fallback for environments without TextEncoder (e.g. older jsdom)
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0xd800 || code >= 0xe000) bytes += 3;
    else { bytes += 4; i++; } // surrogate pair
  }
  return bytes;
}

function checkPayloadSize(payload: unknown): void {
  let str: string;
  try {
    str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  } catch {
    return;
  }
  const bytes = getByteLength(str);
  if (bytes > 65536) {
    throw new Error(`Broadcast payload exceeds the 64 KB limit (${bytes} bytes).`);
  }
}

function warnFeatureOff(): void {
  if (_warnedNotEnabled) return;
  _warnedNotEnabled = true;
  console.warn(
    '[domo.broadcast] App Broadcasting is not enabled on this page. ' +
    'Calls to domo.broadcast / domo.onBroadcast are no-ops.'
  );
}

function getManifestChannels(): Promise<{ publishes?: string[]; subscribes?: string[] } | null> {
  if (_manifestPromise) return _manifestPromise;
  _manifestPromise = (async () => {
    try {
      const resp = await fetch('/manifest.json');
      if (!resp.ok) return null;
      const json = await resp.json();
      return (json as any).channels ?? null;
    } catch {
      return null;
    }
  })();
  return _manifestPromise;
}

function checkLocalhostManifest(topic: string, direction: 'publishes' | 'subscribes'): void {
  if (typeof window === 'undefined' || window.location.hostname !== 'localhost') return;
  getManifestChannels().then(channels => {
    if (!channels) return;
    const declared: string[] =
      (direction === 'publishes' ? channels.publishes : channels.subscribes) ?? [];
    if (!declared.includes(topic)) {
      console.warn(
        `[domo.broadcast] Topic "${topic}" is not declared in manifest.json under channels.${direction}. ` +
        `Add it to your manifest: { "channels": { "${direction}": ["${topic}"] } }`
      );
    }
  });
}

// --- Public API ---

export function broadcast(
  this: any,
  topic: string,
  payload: unknown,
  opts?: { sticky?: boolean }
): void {
  validateTopic(topic);
  checkPayloadSize(payload);
  this.connect();
  if (_appBroadcastingEnabled === false) {
    warnFeatureOff();
    return;
  }
  checkLocalhostManifest(topic, 'publishes');
  window.parent.postMessage(
    JSON.stringify({ event: 'bus.publish', topic, payload, sticky: opts?.sticky ?? false }),
    '*'
  );
}

export function broadcastState(this: any, topic: string, payload: unknown): void {
  broadcast.call(this, topic, payload, { sticky: true });
}

export function onBroadcast(
  this: any,
  topic: string,
  callback: BroadcastCallback
): () => void {
  validateTopic(topic);
  this.connect();
  if (_appBroadcastingEnabled === false) {
    warnFeatureOff();
    return () => {};
  }
  checkLocalhostManifest(topic, 'subscribes');

  if (!_subscriptions.has(topic)) {
    _subscriptions.set(topic, new Set());
    window.parent.postMessage(
      JSON.stringify({ event: 'bus.subscribe', topic }),
      '*'
    );
  }
  _subscriptions.get(topic)!.add(callback);

  return () => {
    const cbs = _subscriptions.get(topic);
    if (!cbs) return;
    cbs.delete(callback);
    if (cbs.size === 0) {
      _subscriptions.delete(topic);
      window.parent.postMessage(
        JSON.stringify({ event: 'bus.unsubscribe', topic }),
        '*'
      );
    }
  };
}

export function onBroadcastOnce(
  this: any,
  topic: string,
  callback: BroadcastCallback
): () => void {
  let unsubscribe: () => void;
  const wrapper: BroadcastCallback = (msg) => {
    unsubscribe();
    callback(msg);
  };
  unsubscribe = onBroadcast.call(this, topic, wrapper);
  return unsubscribe;
}

export function onBroadcastFrom(
  this: any,
  topic: string,
  sourceAppId: string,
  callback: BroadcastCallback
): () => void {
  return onBroadcast.call(this, topic, (msg: BroadcastMessage) => {
    if (msg.sourceAppId === sourceAppId) {
      callback(msg);
    }
  });
}
