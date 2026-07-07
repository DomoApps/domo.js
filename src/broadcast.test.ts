import {
  broadcast,
  onBroadcast,
  onBroadcastOnce,
  onBroadcastFrom,
  receiveBroadcast,
} from './broadcast';

class MockMessagePort {
  onmessage: ((e: any) => void) | null = null;
  postMessage = jest.fn();
  close = jest.fn();
}
(global as any).MessageChannel = class {
  port1 = new MockMessagePort();
  port2 = new MockMessagePort();
};

const postMessageMock = jest.fn();
Object.defineProperty(window, 'parent', {
  value: { postMessage: postMessageMock },
  writable: true,
});

let port1Mock: MockMessagePort;
let mockDomo: any;

beforeEach(() => {
  jest.resetAllMocks();
  port1Mock = new MockMessagePort();
  mockDomo = {
    connect: jest.fn(),
    listeners: { onBroadcast: [] as any[] },
    channel: { port1: port1Mock },
    connected: false,
  };
});

describe('broadcast', () => {
  it('calls connect(true)', () => {
    broadcast.call(mockDomo, 'news', { headline: 'hello' });
    expect(mockDomo.connect).toHaveBeenCalledWith(true);
  });

  it('sends broadcast event via window.parent.postMessage with channel, payload, sticky: false by default', () => {
    broadcast.call(mockDomo, 'news', { headline: 'hello' });
    expect(postMessageMock).toHaveBeenCalledWith(
      JSON.stringify({ event: 'broadcast', channel: 'news', payload: { headline: 'hello' }, sticky: false }),
      '*'
    );
  });

  it('sends sticky: true when opts.sticky is set', () => {
    broadcast.call(mockDomo, 'status', { active: true }, { sticky: true });
    expect(postMessageMock).toHaveBeenCalledWith(
      JSON.stringify({ event: 'broadcast', channel: 'status', payload: { active: true }, sticky: true }),
      '*'
    );
  });

  it('does NOT post over port1', () => {
    broadcast.call(mockDomo, 'news', {});
    expect(port1Mock.postMessage).not.toHaveBeenCalled();
  });
});

describe('onBroadcast', () => {
  it('calls connect(true)', () => {
    onBroadcast.call(mockDomo, 'alerts', jest.fn());
    expect(mockDomo.connect).toHaveBeenCalledWith(true);
  });

  it('does NOT send any wire message', () => {
    onBroadcast.call(mockDomo, 'alerts', jest.fn());
    expect(postMessageMock).not.toHaveBeenCalled();
    expect(port1Mock.postMessage).not.toHaveBeenCalled();
  });

  it('registers a wrapper in listeners.onBroadcast', () => {
    onBroadcast.call(mockDomo, 'alerts', jest.fn());
    expect(mockDomo.listeners.onBroadcast).toHaveLength(1);
  });

  it('invokes callback for matching channel', () => {
    const cb = jest.fn();
    onBroadcast.call(mockDomo, 'alerts', cb);
    receiveBroadcast.call(mockDomo, {
      event: 'broadcast',
      channel: 'alerts',
      payload: { severity: 'high' },
      sourceAppId: 'app-1',
    });
    expect(cb).toHaveBeenCalledWith({
      channel: 'alerts',
      payload: { severity: 'high' },
      sourceAppId: 'app-1',
      timestamp: expect.any(Number),
    });
  });

  it('does NOT invoke callback for a different channel', () => {
    const cb = jest.fn();
    onBroadcast.call(mockDomo, 'alerts', cb);
    receiveBroadcast.call(mockDomo, {
      event: 'broadcast',
      channel: 'other',
      payload: {},
      sourceAppId: 'app-1',
    });
    expect(cb).not.toHaveBeenCalled();
  });

  it('returned unsubscribe removes wrapper from listeners.onBroadcast', () => {
    const unsub = onBroadcast.call(mockDomo, 'alerts', jest.fn());
    expect(mockDomo.listeners.onBroadcast).toHaveLength(1);
    unsub();
    expect(mockDomo.listeners.onBroadcast).toHaveLength(0);
  });

  it('callback not invoked after unsubscribe, even if more events arrive', () => {
    const cb = jest.fn();
    const unsub = onBroadcast.call(mockDomo, 'alerts', cb);
    unsub();
    receiveBroadcast.call(mockDomo, {
      event: 'broadcast',
      channel: 'alerts',
      payload: {},
      sourceAppId: 'app-1',
    });
    expect(cb).not.toHaveBeenCalled();
  });

  it('does NOT send any wire message on unsubscribe', () => {
    const unsub = onBroadcast.call(mockDomo, 'alerts', jest.fn());
    unsub();
    expect(postMessageMock).not.toHaveBeenCalled();
    expect(port1Mock.postMessage).not.toHaveBeenCalled();
  });
});

describe('onBroadcastOnce', () => {
  it('fires callback exactly once', () => {
    const cb = jest.fn();
    onBroadcastOnce.call(mockDomo, 'ping', cb);
    const msg = { event: 'broadcast', channel: 'ping', payload: 1, sourceAppId: 'x' };
    receiveBroadcast.call(mockDomo, msg);
    receiveBroadcast.call(mockDomo, msg);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('wrapper is removed from listeners.onBroadcast after first fire', () => {
    onBroadcastOnce.call(mockDomo, 'ping', jest.fn());
    expect(mockDomo.listeners.onBroadcast).toHaveLength(1);
    receiveBroadcast.call(mockDomo, {
      event: 'broadcast',
      channel: 'ping',
      payload: 1,
      sourceAppId: 'x',
    });
    expect(mockDomo.listeners.onBroadcast).toHaveLength(0);
  });

  it('does NOT send any wire message', () => {
    onBroadcastOnce.call(mockDomo, 'ping', jest.fn());
    receiveBroadcast.call(mockDomo, {
      event: 'broadcast',
      channel: 'ping',
      payload: 1,
      sourceAppId: 'x',
    });
    expect(postMessageMock).not.toHaveBeenCalled();
  });
});

describe('onBroadcastFrom', () => {
  it('only invokes callback when sourceAppId matches', () => {
    const cb = jest.fn();
    onBroadcastFrom.call(mockDomo, 'news', 'app-sender', cb);
    receiveBroadcast.call(mockDomo, {
      event: 'broadcast',
      channel: 'news',
      payload: 'a',
      sourceAppId: 'other-app',
    });
    receiveBroadcast.call(mockDomo, {
      event: 'broadcast',
      channel: 'news',
      payload: 'b',
      sourceAppId: 'app-sender',
    });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ payload: 'b', sourceAppId: 'app-sender' })
    );
  });
});

describe('receiveBroadcast', () => {
  let responsePort: MockMessagePort;

  beforeEach(() => {
    responsePort = new MockMessagePort();
  });

  it('returns early when message is null/undefined', () => {
    expect(() => receiveBroadcast.call(mockDomo, null)).not.toThrow();
    expect(() => receiveBroadcast.call(mockDomo, undefined)).not.toThrow();
  });

  it('dispatches to matching listener and sends ACK via responsePort', () => {
    const cb = jest.fn();
    onBroadcast.call(mockDomo, 'alerts', cb);
    receiveBroadcast.call(
      mockDomo,
      { event: 'broadcast', channel: 'alerts', payload: { val: 1 }, sourceAppId: 'app-a', requestId: 'req-1' },
      responsePort as any
    );
    expect(cb).toHaveBeenCalledWith({
      channel: 'alerts',
      payload: { val: 1 },
      sourceAppId: 'app-a',
      timestamp: expect.any(Number),
    });
    expect(responsePort.postMessage).toHaveBeenCalledWith({
      requestId: 'req-1',
      event: 'ack',
      channel: 'alerts',
    });
  });

  it('drops silently when no listener matches the channel', () => {
    onBroadcast.call(mockDomo, 'other', jest.fn());
    expect(() =>
      receiveBroadcast.call(mockDomo, {
        event: 'broadcast',
        channel: 'unregistered',
        payload: {},
        sourceAppId: 'app-a',
      })
    ).not.toThrow();
    expect(responsePort.postMessage).not.toHaveBeenCalled();
  });

  it('console.warns and does NOT dispatch when message.error is set', () => {
    const cb = jest.fn();
    onBroadcast.call(mockDomo, 'alerts', cb);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    receiveBroadcast.call(
      mockDomo,
      {
        event: 'broadcast',
        channel: 'alerts',
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many messages' },
      },
      responsePort as any
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('RATE_LIMIT_EXCEEDED'));
    expect(cb).not.toHaveBeenCalled();
    expect(responsePort.postMessage).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('error branch runs even when no listeners are registered', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    receiveBroadcast.call(
      mockDomo,
      { event: 'broadcast', error: { code: 'FEATURE_OFF', message: 'Not enabled' } },
      responsePort as any
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('FEATURE_OFF'));
    warnSpy.mockRestore();
  });

  it('uses message.timestamp when provided', () => {
    const cb = jest.fn();
    onBroadcast.call(mockDomo, 'ts-test', cb);
    receiveBroadcast.call(mockDomo, {
      event: 'broadcast',
      channel: 'ts-test',
      payload: {},
      sourceAppId: 'app-x',
      timestamp: 1234567890,
    });
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ timestamp: 1234567890 }));
  });
});
