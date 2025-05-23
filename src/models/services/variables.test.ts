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

beforeEach(() => {
  window.parent.postMessage = jest.fn();
  Object.defineProperty(window.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    configurable: true
  });
  (window as any).webkit = { messageHandlers: { domovariable: { postMessage: jest.fn() } } };
});

describe('sendVariables', () => {
  it('should call sendVariables', () => {
    Domo.sendVariables('vars');
    expect(window.parent.postMessage).toHaveBeenCalled();
  });

  it('should use webkit.messageHandlers.domovariable in sendVariables for iOS', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      configurable: true
    });
    (window as any).webkit = { messageHandlers: { domovariable: { postMessage: jest.fn() } } };
    Domo.sendVariables('vars-ios');
    expect((window as any).webkit.messageHandlers.domovariable.postMessage).toHaveBeenCalledWith('vars-ios');
  });
});

describe('onVariablesUpdated', () => {
  it('should register and unregister onVariablesUpdated', () => {
    const cb = jest.fn();
    const unregister = (Domo as any).onVariablesUpdated(cb);
    expect(typeof unregister).toBe('function');
    unregister();
  });

  it('should handle variablesUpdated event', () => {
    const cb = jest.fn();
    Domo.onVariablesUpdated(cb);
    Domo.connect();
    const port = makeMockPort();
    const variables = { foo: 'bar' };
    Domo.channel.port1.onmessage(makeMessageEvent({ event: 'variablesUpdated', variables }, [port]));
    expect(port.postMessage).toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(variables);
  });
});