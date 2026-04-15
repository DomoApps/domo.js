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
  
  // Clean up any global domovariable
  delete (globalThis as any).domovariable;
  
  // Set up default non-iOS environment
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      maxTouchPoints: 0
    },
    configurable: true
  });
  Object.defineProperty(globalThis, 'webkit', {
    value: undefined,
    configurable: true
  });
  
  Object.defineProperty(window, 'webkit', {
    value: { messageHandlers: { domovariable: { postMessage: jest.fn() } } },
    configurable: true
  });
});

describe('sendVariables', () => {
  it('should call sendVariables', () => {
    const validVariables = JSON.stringify([{ functionId: 1, value: 'test' }]);
    Domo.sendVariables(validVariables);
    expect(window.parent.postMessage).toHaveBeenCalled();
  });

  it('should use webkit.messageHandlers.domovariable in sendVariables for iOS', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        maxTouchPoints: 5
      },
      configurable: true
    });
    Object.defineProperty(window, 'webkit', {
      value: { messageHandlers: { domovariable: { postMessage: jest.fn() } } },
      configurable: true
    });
    // Mock the global domovariable object that the code checks first
    (globalThis as any).domovariable = { postMessage: jest.fn() };
    const validVariables = JSON.stringify([{ functionId: 2, value: 'ios-test' }]);
    Domo.sendVariables(validVariables);
    expect((globalThis as any).domovariable.postMessage).toHaveBeenCalledWith(validVariables);
  });
});

describe('onVariablesUpdated', () => {
  it('should register and unregister onVariablesUpdated', () => {
    const cb = jest.fn();
    const unregister = (Domo as any).onVariablesUpdated(cb);
    expect(typeof unregister).toBe('function');
    expect((Domo as any).listeners.onVariablesUpdated).toContain(cb);
    unregister();
    expect((Domo as any).listeners.onVariablesUpdated).not.toContain(cb);
  });

  it('should handle variablesUpdated event', () => {
    const cb = jest.fn();
    Domo.onVariablesUpdated(cb);
    (Domo as any).connect();
    const port = makeMockPort();
    const variables = { foo: 'bar' };
    Domo.channel?.port1.onmessage?.(makeMessageEvent({ event: 'variablesUpdated', variables }, [port]));
    expect(port.postMessage).toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(variables);
  });
});

describe('Variable type validation', () => {
  it('should accept valid Variable array with functionId', () => {
    const validVariables = [
      { functionId: 1, value: 'test' },
      { functionId: 2, value: 42 },
      { functionId: 3, value: { nested: 'object' } }
    ];

    expect(() => {
      Domo.requestVariablesUpdate(validVariables);
    }).not.toThrow();

    expect(window.parent.postMessage).toHaveBeenCalled();
  });

  it('should accept valid Variable array with name', () => {
    const validVariables = [
      { name: 'My Variable', value: 'test' },
      { name: 'Another Variable', value: 42 }
    ];

    expect(() => {
      Domo.requestVariablesUpdate(validVariables);
    }).not.toThrow();

    expect(window.parent.postMessage).toHaveBeenCalled();
  });

  it('should accept valid Variable array with both functionId and name', () => {
    const validVariables = [
      { functionId: 1, name: 'My Variable', value: 'test' }
    ];

    expect(() => {
      Domo.requestVariablesUpdate(validVariables);
    }).not.toThrow();

    expect(window.parent.postMessage).toHaveBeenCalled();
  });

  it('should accept valid Variable array as JSON string', () => {
    const validVariables = [
      { functionId: 1, value: 'test' },
      { functionId: 2, value: 42 }
    ];
    const jsonString = JSON.stringify(validVariables);

    expect(() => {
      Domo.requestVariablesUpdate(jsonString);
    }).not.toThrow();

    expect(window.parent.postMessage).toHaveBeenCalled();
  });

  it('should throw for malformed Variable array', () => {
    const malformedVariables = [
      { wrongField: 1, value: 'test' }, // missing both functionId and name
      { functionId: 'not-a-number', value: 42 } // functionId is not a number, no name
    ];

    expect(() => {
      Domo.requestVariablesUpdate(malformedVariables as any);
    }).toThrow(Error);

    expect(() => {
      Domo.requestVariablesUpdate(malformedVariables as any);
    }).toThrow(/Invalid variable\(s\) detected/);
  });

  it('should log expected model to console.error for malformed variables', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation();

    try { Domo.requestVariablesUpdate([{ bad: true }] as any); } catch {}
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid variable(s)'),
      expect.stringContaining('Expected format:'),
      expect.objectContaining({ value: expect.any(String) })
    );
    spy.mockClear();

    try { Domo.requestVariablesUpdate('not-json' as any); } catch {}
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('not valid JSON'),
      'not-json',
      expect.stringContaining('Expected format:'),
      expect.any(Array)
    );
    spy.mockClear();

    try { Domo.requestVariablesUpdate([] as any); } catch {}
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('cannot be empty'),
      expect.any(Array)
    );
    spy.mockRestore();
  });

  it('should log expected model to console.error for non-array input', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation();
    try { Domo.requestVariablesUpdate(42 as any); } catch {}
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Variables must be an array'),
      42,
      expect.stringContaining('Expected format:'),
      expect.any(Array)
    );
    spy.mockRestore();
  });

  it('should throw for Variable missing both functionId and name', () => {
    const invalidVariables = [
      { value: 'test' } // no functionId or name
    ];

    expect(() => {
      Domo.requestVariablesUpdate(invalidVariables as any);
    }).toThrow(/Invalid variable\(s\) detected/);
  });
});