import { domoDebug } from './utils/debug';
import { sendToParent } from './utils/messaging';

export interface BroadcastMessage {
  channel: string;
  payload: unknown;
  sourceAppId: string;
  timestamp: number;
}

export type BroadcastCallback = (msg: BroadcastMessage) => void;

export interface BroadcastOptions {}

export function broadcast(
  this: any,
  channel: string,
  payload: unknown,
  opts?: BroadcastOptions
): void {
  this.connect(true);
  const p = { event: 'broadcast', channel, payload };
  sendToParent('broadcast', p);
}

export function onBroadcast(
  this: any,
  channel: string,
  callback: BroadcastCallback
): () => void {
  this.connect(true);
  const wrapper = (msg: BroadcastMessage) => {
    if (msg.channel === channel) callback(msg);
  };
  this.listeners.onBroadcast.push(wrapper);
  return () => {
    const i = this.listeners.onBroadcast.indexOf(wrapper);
    if (i >= 0) this.listeners.onBroadcast.splice(i, 1);
  };
}

export function onBroadcastOnce(
  this: any,
  channel: string,
  callback: BroadcastCallback
): () => void {
  const unsub = onBroadcast.call(this, channel, (msg: BroadcastMessage) => {
    unsub();
    callback(msg);
  });
  return unsub;
}

export function onBroadcastFrom(
  this: any,
  channel: string,
  sourceAppId: string,
  callback: BroadcastCallback
): () => void {
  return onBroadcast.call(this, channel, (msg: BroadcastMessage) => {
    if (msg.sourceAppId === sourceAppId) callback(msg);
  });
}

export function handleBroadcast(
  listeners: BroadcastCallback[],
  message: any,
  responsePort?: MessagePort
): void {
  if (!message) return;
  if (message.error) {
    const channelSuffix = message.channel ? ` (channel: ${message.channel})` : '';
    console.warn(`[domo.broadcast] ${message.error.code} — ${message.error.message}${channelSuffix}`);
    return;
  }
  if (listeners.length) {
    const ack = { requestId: message.requestId, event: 'ack', channel: message.channel };
    domoDebug.log('messages', 'sent:ack:channel', 'ack', ack);
    responsePort?.postMessage(ack);
    const msg: BroadcastMessage = {
      channel: message.channel,
      payload: message.payload,
      sourceAppId: message.sourceAppId,
      timestamp: message.timestamp ?? Date.now(),
    };
    listeners.forEach((cb: BroadcastCallback) => cb(msg));
  }
}
