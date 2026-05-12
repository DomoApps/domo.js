import Domo from '../../domo';

class MockMessagePort {
  onmessage: ((event: any) => void) | null = null;
  postMessage = jest.fn();
  close = jest.fn();
}
(global as any).MessagePort = MockMessagePort;
(global as any).MessageChannel = class {
  port1 = new MockMessagePort();
  port2 = new MockMessagePort();
};

function makeMessageEvent(data: any, ports: any[] = []) {
  return { data, ports } as any;
}

function makeMockPort() {
  return {
    postMessage: jest.fn(),
    onmessage: null as any,
    onmessageerror: null as any,
    close: jest.fn(),
    start: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  };
}

describe('sendAppData', () => {
  beforeEach(() => {
    window.parent.postMessage = jest.fn();
  });

  it('should register and unregister onAppDataUpdated', () => {
    const cb = jest.fn();
    const unregister = (Domo as any).onAppDataUpdated(cb);
    expect(typeof unregister).toBe('function');
    expect((Domo as any).listeners.onAppDataUpdated).toContain(cb);
    unregister();
    expect((Domo as any).listeners.onAppDataUpdated).not.toContain(cb);
  });

  it('should handle appData event', () => {
    const cb = jest.fn();
    Domo.onAppDataUpdated(cb);
    (Domo as any).connect();
    const port = makeMockPort();
    const appData = { foo: 'bar' };
    Domo.channel?.port1.onmessage?.(makeMessageEvent({ event: 'appData', appData }, [port]));
    expect(port.postMessage).toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(appData, undefined);
  });

  it('passes message.requestId as callback 2nd arg (DOMO-483472 inbound)', () => {
    const cb = jest.fn();
    Domo.onAppDataUpdated(cb);
    (Domo as any).connect();
    const port = makeMockPort();
    const appData = 'host-pushed';
    const requestId = 'req_host_echo_1';
    Domo.channel?.port1.onmessage?.(makeMessageEvent(
      { event: 'appData', appData, requestId },
      [port],
    ));
    expect(cb).toHaveBeenCalledWith(appData, requestId);
  });

  it('passes undefined as 2nd arg when message has no requestId', () => {
    const cb = jest.fn();
    Domo.onAppDataUpdated(cb);
    (Domo as any).connect();
    const port = makeMockPort();
    Domo.channel?.port1.onmessage?.(makeMessageEvent(
      { event: 'appData', appData: 'x' },
      [port],
    ));
    expect(cb).toHaveBeenCalledWith('x', undefined);
  });

  it('should send app data successfully', () => {
    Domo.sendAppData('value');
    expect(window.parent.postMessage).toHaveBeenCalled();
  });
});