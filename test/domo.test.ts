// Mock global location before importing domo
(global as any).location = { search: '' };

import Domo, { __mutationObserverCallback } from '../src/domo';

declare global {
  // eslint-disable-next-line no-var
  var _originalXMLHttpRequest: any;
  // eslint-disable-next-line no-var
  var _openSpy: jest.Mock;
  // eslint-disable-next-line no-var
  var _xhrInstance: any;
}

// Mock MessagePort and MessageChannel globally for Jest
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

// Patch window.addEventListener and removeEventListener to track message listeners for test cleanup
const realAddEventListener = window.addEventListener;
const realRemoveEventListener = window.removeEventListener;
(window as any).eventListeners = { message: [] };
window.addEventListener = function(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
  if (type === 'message') {
    (window as any).eventListeners.message.push(listener);
  }
  return realAddEventListener.call(this, type, listener, options);
};
window.removeEventListener = function(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) {
  if (type === 'message') {
    const arr = (window as any).eventListeners.message;
    const idx = arr.indexOf(listener);
    if (idx !== -1) arr.splice(idx, 1);
  }
  return realRemoveEventListener.call(this, type, listener, options);
};

// Mock browser APIs and global objects as needed
beforeEach(() => {
  jest.resetAllMocks();
  (window as any)['__RYUU_SID__'] = 'test-token';
  window.parent.postMessage = jest.fn();
  Object.defineProperty(window.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    configurable: true
  });
  (window as any)['webkit'] = { messageHandlers: { domofilter: { postMessage: jest.fn() }, domovariable: { postMessage: jest.fn() } } };
  // Only redefine MessageChannel if needed for test isolation
  (global as any).MessageChannel = (global as any).MessageChannel;

  // XMLHttpRequest mock for all HTTP verb tests
  globalThis._originalXMLHttpRequest = (global as any).XMLHttpRequest;
  globalThis._openSpy = jest.fn();
  globalThis._xhrInstance = {
    open: globalThis._openSpy,
    setRequestHeader: jest.fn(),
    send: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    onload: null,
    onerror: null,
    readyState: 4,
    status: 200,
    response: '{}',
    getResponseHeader: jest.fn()
  };
  (global as any).XMLHttpRequest = jest.fn(() => globalThis._xhrInstance);
});

afterEach(() => {
  (global as any).XMLHttpRequest = globalThis._originalXMLHttpRequest;
  // Remove all message event listeners to prevent test pollution
  const listeners: EventListenerOrEventListenerObject[] = (window as any).eventListeners?.message ?? [];
  listeners.forEach((listener: EventListenerOrEventListenerObject) => {
    realRemoveEventListener.call(window, 'message', listener);
  });
  (window as any).eventListeners.message = [];
});

describe('domo event/callback APIs', () => {
  const callbackApis = [
    { api: 'onFiltersUpdate', desc: 'onFiltersUpdate' },
    { api: 'onAppData', desc: 'onAppData' },
    { api: 'onVariablesUpdated', desc: 'onVariablesUpdated' },
  ];

  it.each(callbackApis)('should register and unregister $desc', ({ api }) => {
    const cb = jest.fn();
    const unregister = (Domo as any)[api](cb);
    expect(typeof unregister).toBe('function');
    unregister();
  });

  describe('connect/MessageChannel', () => {
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
    function makeMessageEvent(data: any, ports: any[] = []) {
      return { data, ports } as any;
    }
    it('should handle filtersUpdated event', () => {
      const cb = jest.fn();
      Domo.onFiltersUpdate(cb);
      Domo.connect();
      const port = makeMockPort();
      const filters = [{ foo: 'bar' }];
      Domo.channel.port1.onmessage(makeMessageEvent({ event: 'filtersUpdated', filters }, [port]));
      expect(port.postMessage).toHaveBeenCalled();
      expect(cb).toHaveBeenCalledWith(filters);
    });
    it('should handle appData event', () => {
      const cb = jest.fn();
      Domo.onAppData(cb);
      Domo.connect();
      const port = makeMockPort();
      const appData = { foo: 'bar' };
      Domo.channel.port1.onmessage(makeMessageEvent({ event: 'appData', appData }, [port]));
      expect(port.postMessage).toHaveBeenCalled();
      expect(cb).toHaveBeenCalledWith(appData);
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
    it('should early return if responsePort is undefined', () => {
      Domo.connect();
      expect(() => Domo.channel.port1.onmessage(makeMessageEvent({ event: 'filtersUpdated', filters: [] }, []))).not.toThrow();
    });
  });
});

describe('domo.__util (internal utilities)', () => {
  it('should expose the expected private functions', () => {
    expect(typeof Domo.__util.isVerifiedOrigin).toBe('function');
    expect(typeof Domo.__util.isSuccess).toBe('function');
    expect(typeof Domo.__util.getQueryParams).toBe('function');
    expect(typeof Domo.__util.setFormatHeaders).toBe('function');
  });

  it('isSuccess returns true for 2xx, false otherwise', () => {
    expect(Domo.__util.isSuccess(200)).toBe(true);
    expect(Domo.__util.isSuccess(299)).toBe(true);
    expect(Domo.__util.isSuccess(199)).toBe(false);
    expect(Domo.__util.isSuccess(300)).toBe(false);
    expect(Domo.__util.isSuccess(null)).toBe(false);
    expect(Domo.__util.isSuccess(undefined)).toBe(false);
  });

  it('isVerifiedOrigin honors whitelisting and blacklisting', () => {
    expect(Boolean(Domo.__util.isVerifiedOrigin('https://www.domo.com'))).toBe(true);
    expect(Boolean(Domo.__util.isVerifiedOrigin('https://www.domotech.io'))).toBe(true);
    expect(Boolean(Domo.__util.isVerifiedOrigin('https://www.domorig.io'))).toBe(true);
    expect(Boolean(Domo.__util.isVerifiedOrigin('https://domo.demo.domo.com'))).toBe(true);
    expect(Boolean(Domo.__util.isVerifiedOrigin('https://qa2staging.fastage1.domotech.io/auth/index'))).toBe(true);
    expect(Boolean(Domo.__util.isVerifiedOrigin('https://www.domoapps-test.domo.com'))).toBe(false);
    expect(Boolean(Domo.__util.isVerifiedOrigin('https://www.test-domoapps.domo.com'))).toBe(false);
    expect(Boolean(Domo.__util.isVerifiedOrigin('https://www.somethingk.com'))).toBe(false);
    expect(Boolean(Domo.__util.isVerifiedOrigin('https://www.domo.com.bad.io'))).toBe(false);
    expect(Boolean(Domo.__util.isVerifiedOrigin('http://www.domo.com'))).toBe(false);
  });

  it('getQueryParams parses query string', () => {
    Object.defineProperty(global, 'location', {
      value: { search: '?foo=bar&baz=qux' },
      configurable: true
    });
    const params = Domo.__util.getQueryParams();
    expect('foo' in params).toBe(true);
    expect('baz' in params).toBe(true);
    expect((params as any)['foo']).toBe('bar');
    expect((params as any)['baz']).toBe('qux');
  });

  it('setFormatHeaders sets Accept header for data/v URLs', () => {
    const req = { setRequestHeader: jest.fn() };
    Domo.__util.setFormatHeaders(req as any, 'https://domo.com/data/v1', { format: 'array-of-objects' });
    expect(req.setRequestHeader).toHaveBeenCalledWith('Accept', expect.any(String));
  });
});

describe('domo.env and global exposure', () => {
  it('should have env properties with expected types', () => {
    expect(typeof Domo.env).toBe('object');
    expect(typeof Domo.env.userId).toBeDefined();
  });

  it('should expose env and __util', () => {
    expect(Domo.env).toBeDefined();
    expect(Domo.__util).toBeDefined();
  });
});

describe('MutationObserver integration', () => {
  it('should call handleNode when a new element is added to the DOM', () => {
    const handleNodeSpy = jest.spyOn(require('../src/utils/domoutils'), 'handleNode');
    const el = document.createElement('a');
    // Directly invoke the observer callback
    __mutationObserverCallback([
      { addedNodes: [el] }
    ]);
    expect(handleNodeSpy).toHaveBeenCalledWith(el, 'test-token');
    handleNodeSpy.mockRestore();
  });
});

describe('domo uncovered/miscellaneous branches', () => {
  it('should handle catch branch in isVerifiedOrigin', () => {
    expect(Domo.__util.isVerifiedOrigin('not a url')).toBe(false);
  });

  it('should use DataFormats.DEFAULT in setFormatHeaders', () => {
    const req = { setRequestHeader: jest.fn() };
    Domo.__util.setFormatHeaders(req as any, 'https://domo.com/data/v1', {});
    expect(req.setRequestHeader).toHaveBeenCalledWith('Accept', expect.anything());
  });

  it('should import FilterDataTypes from models/index', () => {
    const { FilterDataTypes } = require('../src/models/interfaces/filter-data-types');
    expect(FilterDataTypes).toBeDefined();
  });
});
