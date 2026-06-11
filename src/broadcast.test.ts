import {
  handleCapabilities,
  handleBusMessage,
  handleBusError,
  broadcast,
  broadcastState,
  onBroadcast,
  onBroadcastOnce,
  onBroadcastFrom,
  __resetForTesting,
  _subscriptions,
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

// Minimal mock Domo context for `this`
const mockDomo = {
  connect: jest.fn(),
  listeners: {},
  channel: undefined as any,
  connected: false,
};

beforeEach(() => {
  jest.resetAllMocks();
  postMessageMock.mockClear();
  __resetForTesting();
  mockDomo.connect.mockClear();
});

// --- Handler tests ---

describe('handleCapabilities', () => {
  it('does not throw when appBroadcasting is true', () => {
    expect(() => handleCapabilities({ appBroadcasting: true })).not.toThrow();
  });

  it('does not throw when appBroadcasting is false', () => {
    expect(() => handleCapabilities({ appBroadcasting: false })).not.toThrow();
  });
});

describe('handleBusMessage', () => {
  it('dispatches to registered callbacks for the topic', () => {
    handleCapabilities({ appBroadcasting: true });
    const callback = jest.fn();
    _subscriptions.set('my-topic', new Set([callback]));
    handleBusMessage({ topic: 'my-topic', payload: { value: 42 }, sourceAppId: 'app-abc' });
    expect(callback).toHaveBeenCalledWith({ value: 42 }, 'app-abc');
  });

  it('does nothing if no callbacks registered for topic', () => {
    expect(() =>
      handleBusMessage({ topic: 'unknown-topic', payload: {}, sourceAppId: 'app-1' })
    ).not.toThrow();
  });
});

describe('handleBusError', () => {
  it('logs a console.warn with code and message', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    handleBusError({ code: 'RATE_LIMIT_EXCEEDED', message: 'Too many messages', topic: 'my-topic' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('RATE_LIMIT_EXCEEDED'));
    warnSpy.mockRestore();
  });

  it('handles missing topic gracefully', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => handleBusError({ code: 'UNKNOWN', message: 'err' })).not.toThrow();
    warnSpy.mockRestore();
  });
});

// --- broadcast API tests ---

describe('broadcast', () => {
  beforeEach(() => {
    handleCapabilities({ appBroadcasting: true });
  });

  it('sends bus.publish with topic and payload via postMessage', () => {
    broadcast.call(mockDomo, 'news', { headline: 'hello' });
    expect(postMessageMock).toHaveBeenCalledWith(
      JSON.stringify({ event: 'bus.publish', topic: 'news', payload: { headline: 'hello' }, sticky: false }),
      '*'
    );
  });

  it('throws for reserved domo: namespace', () => {
    expect(() => broadcast.call(mockDomo, 'domo:internal', {})).toThrow(/reserved/i);
  });

  it('throws for payload exceeding 64 KB', () => {
    const bigPayload = 'x'.repeat(65537);
    expect(() => broadcast.call(mockDomo, 'news', bigPayload)).toThrow(/64 KB/i);
  });

  it('no-ops and warns once when feature is disabled', () => {
    __resetForTesting();
    handleCapabilities({ appBroadcasting: false });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    broadcast.call(mockDomo, 'news', {});
    broadcast.call(mockDomo, 'news', {});
    expect(postMessageMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('sends when capabilities not yet received (optimistic)', () => {
    __resetForTesting();
    // _appBroadcastingEnabled is null (not received yet) — should send optimistically
    broadcast.call(mockDomo, 'news', {});
    expect(postMessageMock).toHaveBeenCalled();
  });
});

describe('broadcastState', () => {
  beforeEach(() => {
    handleCapabilities({ appBroadcasting: true });
  });

  it('sends bus.publish with sticky: true', () => {
    broadcastState.call(mockDomo, 'status', { active: true });
    expect(postMessageMock).toHaveBeenCalledWith(
      JSON.stringify({ event: 'bus.publish', topic: 'status', payload: { active: true }, sticky: true }),
      '*'
    );
  });
});

describe('onBroadcast', () => {
  beforeEach(() => {
    handleCapabilities({ appBroadcasting: true });
  });

  it('sends bus.subscribe for the topic on first subscriber', () => {
    onBroadcast.call(mockDomo, 'alerts', jest.fn());
    expect(postMessageMock).toHaveBeenCalledWith(
      JSON.stringify({ event: 'bus.subscribe', topic: 'alerts' }),
      '*'
    );
  });

  it('does NOT send bus.subscribe again for a second subscriber to same topic', () => {
    onBroadcast.call(mockDomo, 'alerts', jest.fn());
    postMessageMock.mockClear();
    onBroadcast.call(mockDomo, 'alerts', jest.fn());
    expect(postMessageMock).not.toHaveBeenCalled();
  });

  it('calls callback when bus.message arrives for the topic', () => {
    const cb = jest.fn();
    onBroadcast.call(mockDomo, 'alerts', cb);
    handleBusMessage({ topic: 'alerts', payload: { severity: 'high' }, sourceAppId: 'app-1' });
    expect(cb).toHaveBeenCalledWith({ severity: 'high' }, 'app-1');
  });

  it('returns unsubscribe that sends bus.unsubscribe when last subscriber leaves', () => {
    const unsub = onBroadcast.call(mockDomo, 'alerts', jest.fn());
    postMessageMock.mockClear();
    unsub();
    expect(postMessageMock).toHaveBeenCalledWith(
      JSON.stringify({ event: 'bus.unsubscribe', topic: 'alerts' }),
      '*'
    );
  });

  it('does NOT send bus.unsubscribe when a non-last subscriber leaves', () => {
    const unsub1 = onBroadcast.call(mockDomo, 'alerts', jest.fn());
    onBroadcast.call(mockDomo, 'alerts', jest.fn());
    postMessageMock.mockClear();
    unsub1();
    expect(postMessageMock).not.toHaveBeenCalled();
  });

  it('returns no-op unsubscribe and warns once when feature is disabled', () => {
    __resetForTesting();
    handleCapabilities({ appBroadcasting: false });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const unsub1 = onBroadcast.call(mockDomo, 'alerts', jest.fn());
    const unsub2 = onBroadcast.call(mockDomo, 'alerts', jest.fn());
    expect(postMessageMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(() => unsub1()).not.toThrow();
    expect(() => unsub2()).not.toThrow();
    warnSpy.mockRestore();
  });
});

describe('onBroadcastOnce', () => {
  beforeEach(() => {
    handleCapabilities({ appBroadcasting: true });
  });

  it('fires callback exactly once and then auto-unsubscribes', () => {
    const cb = jest.fn();
    onBroadcastOnce.call(mockDomo, 'ping', cb);
    handleBusMessage({ topic: 'ping', payload: 1, sourceAppId: 'x' });
    handleBusMessage({ topic: 'ping', payload: 2, sourceAppId: 'x' });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(1, 'x');
    expect(postMessageMock).toHaveBeenCalledWith(
      JSON.stringify({ event: 'bus.unsubscribe', topic: 'ping' }),
      '*'
    );
  });
});

describe('onBroadcastFrom', () => {
  beforeEach(() => {
    handleCapabilities({ appBroadcasting: true });
  });

  it('only calls callback when sourceAppId matches', () => {
    const cb = jest.fn();
    onBroadcastFrom.call(mockDomo, 'app-sender', 'news', cb);
    handleBusMessage({ topic: 'news', payload: 'a', sourceAppId: 'other-app' });
    handleBusMessage({ topic: 'news', payload: 'b', sourceAppId: 'app-sender' });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('b', 'app-sender');
  });
});

// --- Localhost manifest check tests (DOMO-487607) ---

describe('localhost manifest check (DOMO-487607)', () => {
  beforeEach(() => {
    handleCapabilities({ appBroadcasting: true });
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost' },
      writable: true,
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        channels: {
          publishes: ['declared-topic'],
          subscribes: ['declared-topic'],
        },
      }),
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'testhost' },
      writable: true,
    });
    delete (global as any).fetch;
  });

  it('does not warn for a topic declared in manifest.channels.publishes', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    broadcast.call(mockDomo, 'declared-topic', {});
    await new Promise(r => setTimeout(r, 20));
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('warns for a topic NOT declared in manifest.channels.publishes', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    broadcast.call(mockDomo, 'undeclared-topic', {});
    await new Promise(r => setTimeout(r, 20));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('undeclared-topic'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('channels.publishes'));
    warnSpy.mockRestore();
  });

  it('warns for a topic NOT declared in manifest.channels.subscribes', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    onBroadcast.call(mockDomo, 'undeclared-topic', jest.fn());
    await new Promise(r => setTimeout(r, 20));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('channels.subscribes'));
    warnSpy.mockRestore();
  });

  it('does not warn when not on localhost', async () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'myapp.domoapps.prodaws.domo.com' },
      writable: true,
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    broadcast.call(mockDomo, 'undeclared-topic', {});
    await new Promise(r => setTimeout(r, 20));
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('does not throw when manifest.json is missing (fetch returns 404)', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => broadcast.call(mockDomo, 'any-topic', {})).not.toThrow();
    await new Promise(r => setTimeout(r, 20));
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
