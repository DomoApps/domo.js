import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DomoEmulator } from './core';
import type { Filter, Variable } from './types';

// ─── MessageChannel mock ──────────────────────────────────────────────────────

class MockMessagePort {
  onmessage: ((e: MessageEvent) => void) | null = null;
  private _other: MockMessagePort | null = null;

  _link(other: MockMessagePort) {
    this._other = other;
  }

  postMessage(data: unknown, transferOrOptions?: unknown) {
    const transfers = Array.isArray(transferOrOptions) ? transferOrOptions : [];
    const event = new MessageEvent('message', { data, ports: transfers as MessagePort[] });
    if (this._other?.onmessage) {
      this._other.onmessage(event);
    }
  }

  start() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true; }
}

class MockMessageChannel {
  port1: MockMessagePort;
  port2: MockMessagePort;
  constructor() {
    this.port1 = new MockMessagePort();
    this.port2 = new MockMessagePort();
    this.port1._link(this.port2);
    this.port2._link(this.port1);
  }
}

// ─── Panel mock ───────────────────────────────────────────────────────────────

vi.mock('./panel', () => ({
  createPanel: vi.fn(() => ({
    updateLog: vi.fn(),
    remove: vi.fn(),
  })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSubscribeEvent(port: MessagePort): MessageEvent {
  return new MessageEvent('message', {
    data: { event: 'subscribe' },
    ports: [port],
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DomoEmulator', () => {
  let originalParent: Window;
  let originalMessageChannel: typeof MessageChannel;
  let addEventSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalParent = window.parent;
    originalMessageChannel = window.MessageChannel;

    // Simulate standalone (no parent frame)
    Object.defineProperty(window, 'parent', { value: window, configurable: true });

    // Replace global MessageChannel with mock
    (window as typeof window & { MessageChannel: unknown }).MessageChannel = MockMessageChannel;

    addEventSpy = vi.spyOn(window, 'addEventListener');
  });

  afterEach(() => {
    Object.defineProperty(window, 'parent', { value: originalParent, configurable: true });
    (window as typeof window & { MessageChannel: unknown }).MessageChannel = originalMessageChannel;
    vi.restoreAllMocks();
  });

  // ── install() ──────────────────────────────────────────────────────────────

  it('registers a capture message listener on install()', () => {
    const emulator = new DomoEmulator();
    emulator.install();

    const calls = addEventSpy.mock.calls.filter(
      ([type, , opts]) => type === 'message' && (opts as AddEventListenerOptions)?.capture === true,
    );
    expect(calls.length).toBeGreaterThan(0);

    emulator.uninstall();
  });

  it('does not install when window.parent !== window', () => {
    Object.defineProperty(window, 'parent', {
      value: {} as Window,
      configurable: true,
    });

    const emulator = new DomoEmulator();
    emulator.install();

    const calls = addEventSpy.mock.calls.filter(
      ([type, , opts]) => type === 'message' && (opts as AddEventListenerOptions)?.capture === true,
    );
    expect(calls.length).toBe(0);
  });

  it('does not double-install', () => {
    const emulator = new DomoEmulator();
    emulator.install();
    emulator.install();

    const calls = addEventSpy.mock.calls.filter(
      ([type, , opts]) => type === 'message' && (opts as AddEventListenerOptions)?.capture === true,
    );
    expect(calls.length).toBe(1);

    emulator.uninstall();
  });

  // ── subscribe → port capture ───────────────────────────────────────────────

  it('captures port2 and schedules sendInitialState when subscribe arrives', () => {
    vi.useFakeTimers();
    const emulator = new DomoEmulator({ initialDelayMs: 50 });
    emulator.install();

    const mc = new MockMessageChannel();
    const sendSpy = vi.spyOn(mc.port1 as unknown as { postMessage: () => void }, 'postMessage');
    const event = makeSubscribeEvent(mc.port1 as unknown as MessagePort);
    window.dispatchEvent(event);

    // Before delay fires, postMessage should not have been called
    expect(sendSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60);
    // No filters/variables in config — sendInitialState is a no-op here
    // Just confirm it ran without errors
    vi.useRealTimers();
    emulator.uninstall();
  });

  it('sends initial filters after delay when config has filters', () => {
    vi.useFakeTimers();
    const filters: Filter[] = [
      { columnName: 'Region', operator: 'IN', values: ['West'], dataType: 'STRING' },
    ];
    const emulator = new DomoEmulator({ filters, initialDelayMs: 50 });
    emulator.install();

    const mc = new MockMessageChannel();
    const postSpy = vi.spyOn(mc.port1 as unknown as { postMessage: (...args: unknown[]) => void }, 'postMessage');
    window.dispatchEvent(makeSubscribeEvent(mc.port1 as unknown as MessagePort));

    vi.advanceTimersByTime(60);

    expect(postSpy).toHaveBeenCalledOnce();
    const [data] = postSpy.mock.calls[0] as [{ event: string; filters: Filter[] }];
    expect(data.event).toBe('filtersUpdated');
    expect(data.filters).toEqual(filters);

    vi.useRealTimers();
    emulator.uninstall();
  });

  // ── pushFiltersUpdated ─────────────────────────────────────────────────────

  it('pushFiltersUpdated() calls port2.postMessage with correct shape', () => {
    const emulator = new DomoEmulator();
    emulator.install();

    const mc = new MockMessageChannel();
    const postSpy = vi.spyOn(mc.port1 as unknown as { postMessage: (...args: unknown[]) => void }, 'postMessage');
    window.dispatchEvent(makeSubscribeEvent(mc.port1 as unknown as MessagePort));

    const filters: Filter[] = [
      { columnName: 'Status', operator: 'IN', values: ['Active'], dataType: 'STRING' },
    ];
    emulator.pushFiltersUpdated(filters);

    expect(postSpy).toHaveBeenCalledOnce();
    const [data] = postSpy.mock.calls[0] as [{ event: string; filters: Filter[]; requestId: string }];
    expect(data.event).toBe('filtersUpdated');
    expect(data.filters).toEqual(filters);
    expect(typeof data.requestId).toBe('string');
    expect(data.requestId.length).toBeGreaterThan(0);

    emulator.uninstall();
  });

  it('includes a transferable ACK port alongside the message', () => {
    const emulator = new DomoEmulator();
    emulator.install();

    const mc = new MockMessageChannel();
    const postSpy = vi.spyOn(mc.port1 as unknown as { postMessage: (...args: unknown[]) => void }, 'postMessage');
    window.dispatchEvent(makeSubscribeEvent(mc.port1 as unknown as MessagePort));

    emulator.pushFiltersUpdated([
      { columnName: 'X', operator: 'IN', values: ['1'], dataType: 'STRING' },
    ]);

    // Second arg should be an array containing a port
    const transferArg = postSpy.mock.calls[0][1] as MessagePort[];
    expect(Array.isArray(transferArg)).toBe(true);
    expect(transferArg.length).toBe(1);

    emulator.uninstall();
  });

  // ── outbound message logging ───────────────────────────────────────────────

  it('logs outbound filter messages received on the capture listener', () => {
    const emulator = new DomoEmulator();
    emulator.install();

    // Simulate an outbound message the app sent (e.g. requestFiltersUpdate)
    window.dispatchEvent(
      new MessageEvent('message', { data: { event: 'filter', filter: [] } }),
    );

    const log = emulator.getLog();
    expect(log.some((e) => e.event === 'filter' && e.dir === 'out')).toBe(true);

    emulator.uninstall();
  });

  // ── pushVariablesUpdated ───────────────────────────────────────────────────

  it('pushVariablesUpdated() sends correct event shape', () => {
    const emulator = new DomoEmulator();
    emulator.install();

    const mc = new MockMessageChannel();
    const postSpy = vi.spyOn(mc.port1 as unknown as { postMessage: (...args: unknown[]) => void }, 'postMessage');
    window.dispatchEvent(makeSubscribeEvent(mc.port1 as unknown as MessagePort));

    const variables: Variable[] = [{ functionId: 42, value: 'Q1 2026' }];
    emulator.pushVariablesUpdated(variables);

    const [data] = postSpy.mock.calls[0] as [{ event: string; variables: Variable[] }];
    expect(data.event).toBe('variablesUpdated');
    expect(data.variables).toEqual(variables);

    emulator.uninstall();
  });

  // ── roundtrip: outbound filter → inbound filtersUpdated ───────────────────

  it('ACKs an outbound filter request and pushes filtersUpdated back', () => {
    const emulator = new DomoEmulator();
    emulator.install();

    const mc = new MockMessageChannel();
    const postSpy = vi.spyOn(mc.port1 as unknown as { postMessage: (...args: unknown[]) => void }, 'postMessage');
    window.dispatchEvent(makeSubscribeEvent(mc.port1 as unknown as MessagePort));

    const filters: Filter[] = [
      { columnName: 'Region', operator: 'IN', values: ['West'], dataType: 'STRING' },
    ];
    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ event: 'filter', requestId: 'req-1', filter: filters }),
      }),
    );

    // First call: ACK; second call: filtersUpdated push
    expect(postSpy).toHaveBeenCalledTimes(2);
    const [ackData] = postSpy.mock.calls[0] as [{ event: string; requestId: string }];
    expect(ackData.event).toBe('ack');
    expect(ackData.requestId).toBe('req-1');

    const [pushData] = postSpy.mock.calls[1] as [{ event: string; filters: Filter[] }];
    expect(pushData.event).toBe('filtersUpdated');
    expect(pushData.filters).toEqual(filters);

    emulator.uninstall();
  });

  it('ACKs an outbound variable request and pushes variablesUpdated back', () => {
    const emulator = new DomoEmulator();
    emulator.install();

    const mc = new MockMessageChannel();
    const postSpy = vi.spyOn(mc.port1 as unknown as { postMessage: (...args: unknown[]) => void }, 'postMessage');
    window.dispatchEvent(makeSubscribeEvent(mc.port1 as unknown as MessagePort));

    const variables: Variable[] = [{ functionId: 99, value: 'Q2' }];
    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ event: 'variable', requestId: 'req-2', variables }),
      }),
    );

    expect(postSpy).toHaveBeenCalledTimes(2);
    const [ackData] = postSpy.mock.calls[0] as [{ event: string; requestId: string }];
    expect(ackData.event).toBe('ack');
    expect(ackData.requestId).toBe('req-2');

    const [pushData] = postSpy.mock.calls[1] as [{ event: string; variables: Variable[] }];
    expect(pushData.event).toBe('variablesUpdated');
    expect(pushData.variables).toEqual(variables);

    emulator.uninstall();
  });

  it('ACKs an outbound appData request and pushes appDataUpdated back', () => {
    const emulator = new DomoEmulator();
    emulator.install();

    const mc = new MockMessageChannel();
    const postSpy = vi.spyOn(mc.port1 as unknown as { postMessage: (...args: unknown[]) => void }, 'postMessage');
    window.dispatchEvent(makeSubscribeEvent(mc.port1 as unknown as MessagePort));

    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ event: 'appData', requestId: 'req-3', appData: 'hello' }),
      }),
    );

    expect(postSpy).toHaveBeenCalledTimes(2);
    const [ackData] = postSpy.mock.calls[0] as [{ event: string; requestId: string }];
    expect(ackData.event).toBe('ack');
    expect(ackData.requestId).toBe('req-3');

    const [pushData] = postSpy.mock.calls[1] as [{ event: string; appData: string }];
    expect(pushData.event).toBe('appData');
    expect(pushData.appData).toBe('hello');

    emulator.uninstall();
  });

  it('does not push filtersUpdated for null filter requests (initial connect)', () => {
    const emulator = new DomoEmulator();
    emulator.install();

    const mc = new MockMessageChannel();
    const postSpy = vi.spyOn(mc.port1 as unknown as { postMessage: (...args: unknown[]) => void }, 'postMessage');
    window.dispatchEvent(makeSubscribeEvent(mc.port1 as unknown as MessagePort));

    // Null filter request (sent by SDK on first onFiltersUpdated registration)
    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ event: 'filter', requestId: 'req-null', filter: undefined }),
      }),
    );

    // Only ACK, no filtersUpdated push
    const calls = (postSpy.mock.calls as unknown as [{ event: string }][]).map(([d]) => d.event);
    expect(calls).toContain('ack');
    expect(calls).not.toContain('filtersUpdated');

    emulator.uninstall();
  });

  // ── panel ──────────────────────────────────────────────────────────────────

  it('renders panel into DOM on install() when body is present', async () => {
    const { createPanel } = await import('./panel');
    const emulator = new DomoEmulator();
    emulator.install();

    expect(createPanel).toHaveBeenCalled();

    emulator.uninstall();
  });
});
