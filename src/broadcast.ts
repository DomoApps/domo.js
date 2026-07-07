import { domoDebug } from './utils/debug';

export interface BroadcastMessage {
  channel: string;
  payload: unknown;
  sourceAppId: string;
  timestamp: number;
}

export type BroadcastCallback = (msg: BroadcastMessage) => void;

export function broadcast(
  this: any,
  channel: string,
  payload: unknown,
  opts?: { sticky?: boolean }
): void {
  this.connect(true);
  const p = { event: 'broadcast', channel, payload, sticky: opts?.sticky ?? false };
  domoDebug.log('messages', 'sent:channel', 'broadcast', p);
  this.channel.port1.postMessage(p);
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

export function handleCapabilities(_data: { appBroadcasting?: boolean }): void {}

export function handleBusMessage(
  this: any,
  data: { topic: string; payload: unknown; sourceAppId: string; timestamp?: number },
  responsePort?: MessagePort
): void {
  receiveBroadcast.call(this, { ...data, channel: data.topic, event: 'broadcast' }, responsePort);
}

export function handleBusError(data: { code: string; message: string; topic?: string }): void {
  const channelSuffix = data.topic ? ` (channel: ${data.topic})` : '';
  console.warn(`[domo.broadcast] ${data.code} — ${data.message}${channelSuffix}`);
}

export function receiveBroadcast(
  this: any,
  message: any,
  responsePort?: MessagePort
): void {
  if (!message) return;
  if (message.error) {
    const channelSuffix = message.channel ? ` (channel: ${message.channel})` : '';
    console.warn(`[domo.broadcast] ${message.error.code} — ${message.error.message}${channelSuffix}`);
    return;
  }
  if (this.listeners.onBroadcast.length) {
    const ack = { requestId: message.requestId, event: 'ack', channel: message.channel };
    domoDebug.log('messages', 'sent:ack:channel', 'ack', ack);
    responsePort?.postMessage(ack);
    const msg: BroadcastMessage = {
      channel: message.channel,
      payload: message.payload,
      sourceAppId: message.sourceAppId,
      timestamp: message.timestamp ?? Date.now(),
    };
    this.listeners.onBroadcast.forEach((cb: BroadcastCallback) => cb(msg));
  }
}
