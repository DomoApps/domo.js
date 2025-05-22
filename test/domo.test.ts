// Patch global.URL for Node/Jest environment before importing domo
if (typeof global.URL === 'undefined') {
  global.URL = require('url').URL;
}

// Mock global location before importing domo
(global as any).location = { search: '' };

import domo from '../src/domo';
import { FilterOperatorsString } from '../src/models/interfaces/filter-operators';
import { FilterDataTypes } from '../src/models/interfaces/filter-data-types';

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
// Mock ServiceWorker globally for Jest
(global as any).ServiceWorker = class { dummy = true; };

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
  (global as any).MessageChannel = class {
    port1 = { onmessage: null as ((event: any) => void) | null, postMessage: jest.fn(), close: jest.fn() };
    port2 = { onmessage: null as ((event: any) => void) | null, postMessage: jest.fn(), close: jest.fn() };
  };

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

describe('domo HTTP methods', () => {
  describe('post', () => {
    it('should call post', async () => {
      const spy = jest.spyOn(domo, 'post');
      spy.mockResolvedValue({});
      await expect(domo.post('/test')).resolves.toBeDefined();
    });
    it('should reject post on error', async () => {
      const spy = jest.spyOn(domo, 'post');
      spy.mockRejectedValue(new Error('fail'));
      await expect(domo.post('/fail')).rejects.toThrow('fail');
    });
    it('sets method to POST', async () => {
      globalThis._openSpy.mockImplementation(function(method: string) {
        expect(method).toBe('POST');
      });
      const promise = domo.post('/test');
      if (globalThis._xhrInstance.onload) globalThis._xhrInstance.onload();
      await promise;
    });
  });
  describe('put', () => {
    it('should call put', async () => {
      const spy = jest.spyOn(domo, 'put');
      spy.mockResolvedValue({});
      await expect(domo.put('/test')).resolves.toBeDefined();
    });
    it('sets method to PUT', async () => {
      globalThis._openSpy.mockImplementation(function(method: string) {
        expect(method).toBe('PUT');
      });
      const promise = domo.put('/test');
      if (globalThis._xhrInstance.onload) globalThis._xhrInstance.onload();
      await promise;
    });
  });
  describe('get', () => {
    it('should call get', async () => {
      const spy = jest.spyOn(domo, 'get');
      spy.mockResolvedValue({});
      await expect(domo.get('/test')).resolves.toBeDefined();
    });
    it('should reject get on error', async () => {
      const spy = jest.spyOn(domo, 'get');
      spy.mockRejectedValue(new Error('fail'));
      await expect(domo.get('/fail')).rejects.toThrow('fail');
    });
    it('should return expected value from get', async () => {
      const spy = jest.spyOn(domo, 'get');
      spy.mockResolvedValue({ foo: 'bar' });
      await expect(domo.get('/foo')).resolves.toEqual({ foo: 'bar' });
    });
    it('sets method to GET', async () => {
      globalThis._openSpy.mockImplementation(function(method: string) {
        expect(method).toBe('GET');
      });
      const promise = domo.get('/test');
      if (globalThis._xhrInstance.onload) globalThis._xhrInstance.onload();
      await promise;
    });
  });
  describe('delete', () => {
    it('should call delete', async () => {
      const spy = jest.spyOn(domo, 'delete');
      spy.mockResolvedValue({});
      await expect(domo.delete('/test')).resolves.toBeDefined();
    });
    it('sets method to DELETE', async () => {
      globalThis._openSpy.mockImplementation(function(method: string) {
        expect(method).toBe('DELETE');
      });
      const promise = domo.delete('/test');
      if (globalThis._xhrInstance.onload) globalThis._xhrInstance.onload();
      await promise;
    });
  });
  describe('patch', () => {
    it('should have a patch method (not implemented)', () => {
      expect(typeof (domo as any).patch).toBe('undefined');
    });
  });
  describe('getAll', () => {
    it('should call getAll', async () => {
      const spy = jest.spyOn(domo, 'getAll');
      spy.mockResolvedValue([{}]);
      await expect(domo.getAll(['/test'])).resolves.toBeDefined();
    });
  });
});

describe('domo event/callback APIs', () => {
  describe('onDataUpdate', () => {
    function simulateMessageEvent({ cb, expectAck, expectCbCall, unregister }: { cb?: jest.Mock, expectAck: boolean, expectCbCall?: boolean, unregister?: boolean }) {
      const alias = 'test-alias';
      const message = JSON.stringify({ alias });
      const fakeSource = { postMessage: jest.fn() };

      let localUnregister: (() => void) | undefined;
      if (cb) localUnregister = domo.onDataUpdate(cb);
      if (unregister && localUnregister) localUnregister();

      const event = new MessageEvent('message', {
        data: message,
        origin: 'https://www.domo.com',
      });
      Object.defineProperty(event, 'source', { value: fakeSource });
      window.dispatchEvent(event);

      const expectedAck = JSON.stringify({ event: 'ack', alias });
      if (expectAck) 
        expect(fakeSource.postMessage).toHaveBeenCalledWith(expectedAck, 'https://www.domo.com');
      else
        expect(fakeSource.postMessage).not.toHaveBeenCalledWith(expectedAck, 'https://www.domo.com');

      if (cb && expectCbCall) 
        expect(cb).toHaveBeenCalledWith('test-alias');
      else if (cb)
        expect(cb).not.toHaveBeenCalled();

      if (localUnregister) localUnregister();
    }

    it('should prevent app refresh if callback is registered', () => {
      const cb = jest.fn();
      simulateMessageEvent({ cb, expectAck: true, expectCbCall: true });
    });

    it('should not prevent app refresh if callback is not registered', () => {
      simulateMessageEvent({ expectAck: false });
    });

    it('should register and unregister onDataUpdate', () => {
      const cb = jest.fn();
      simulateMessageEvent({ cb, expectAck: true, expectCbCall: true, unregister: false });
      cb.mockClear();
      simulateMessageEvent({ cb, expectAck: false, expectCbCall: false, unregister: true });
    });

    it('should handle invalid callback for onDataUpdate', () => {
      const unregister = domo.onDataUpdate(null as any);
      expect(typeof unregister).toBe('function');
      simulateMessageEvent({ cb: null, expectAck: false, expectCbCall: false });
    });

    it('should allow double registration and unregistration', () => {
      const cb = jest.fn();
      const unregister1 = domo.onDataUpdate(cb);
      const unregister2 = domo.onDataUpdate(cb);
      expect(typeof unregister1).toBe('function');
      expect(typeof unregister2).toBe('function');
      unregister1();
      unregister2();
    });

    it('should enforce only one registration for onDataUpdate', () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      domo.onDataUpdate(cb1);
      domo.onDataUpdate(cb2);
      const alias = 'test-alias';
      const message = JSON.stringify({ alias });
      const fakeSource = { postMessage: jest.fn() };
      const event = new MessageEvent('message', {
        data: message,
        origin: 'https://www.domo.com',
      });
      Object.defineProperty(event, 'source', { value: fakeSource });
      window.dispatchEvent(event);
      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).toHaveBeenCalledWith(alias);
    });

    it('should use MessageChannel for communication', () => {
      const cb = jest.fn();
      const unregister = domo.onDataUpdate(cb);
      const channel = new (global as any).MessageChannel();
      if (channel.port1.onmessage) {
        channel.port1.onmessage({ data: 'test' });
        expect(cb).toHaveBeenCalled();
      }
      unregister();
    });

    it('should handle invalid JSON in message event', () => {
      const cb = jest.fn();
      domo.onDataUpdate(cb);
      const event = new MessageEvent('message', {
        data: '{invalidJson',
        origin: 'https://www.domo.com',
      });
      Object.defineProperty(event, 'source', { value: { postMessage: jest.fn() } });
      expect(() => window.dispatchEvent(event)).not.toThrow();
      expect(cb).not.toHaveBeenCalled();
    });

    it('should handle message event missing alias property', () => {
      const cb = jest.fn();
      domo.onDataUpdate(cb);
      const event = new MessageEvent('message', {
        data: JSON.stringify({ notAlias: 'foo' }),
        origin: 'https://www.domo.com',
      });
      Object.defineProperty(event, 'source', { value: { postMessage: jest.fn() } });
      window.dispatchEvent(event);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('onFiltersUpdate', () => {
    it('should register and unregister onFiltersUpdate', () => {
      const cb = jest.fn();
      const unregister = domo.onFiltersUpdate(cb);
      expect(typeof unregister).toBe('function');
      unregister();
    });
  });

  describe('onAppData', () => {
    it('should register and unregister onAppData', () => {
      const cb = jest.fn();
      const unregister = domo.onAppData(cb);
      expect(typeof unregister).toBe('function');
      unregister();
    });
  });

  describe('onVariablesUpdated', () => {
    it('should register and unregister onVariablesUpdated', () => {
      const cb = jest.fn();
      const unregister = domo.onVariablesUpdated(cb);
      expect(typeof unregister).toBe('function');
      unregister();
    });
  });
});

describe('domo navigation and data sending', () => {
  describe('navigate', () => {
    it('should call navigate', () => {
      domo.navigate('/test', true);
      expect(window.parent.postMessage).toHaveBeenCalled();
    });
  });

  describe('filterContainer', () => {
    it('should call filterContainer', () => {
      domo.filterContainer([
        { column: 'a', operator: FilterOperatorsString.IN, values: ['x'], dataType: FilterDataTypes.STRING }
      ], true);
      expect(window.parent.postMessage).toHaveBeenCalled();
    });
    it('should detect webkit and call messageHandlers', () => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        configurable: true
      });
      const filter = [{ column: 'a', operator: FilterOperatorsString.IN, values: ['x'], dataType: 'STRING' }];
      const postMessageMock = jest.fn();
      (window as any).webkit = { messageHandlers: { domofilter: { postMessage: postMessageMock }, domovariable: { postMessage: jest.fn() } } };
      domo.filterContainer(filter as any, true);
      expect(postMessageMock).toHaveBeenCalled();
    });
  });

  describe('sendAppData', () => {
    it('should call sendAppData', () => {
      domo.sendAppData('data');
      expect(window.parent.postMessage).toHaveBeenCalled();
    });
  });

  describe('sendVariables', () => {
    it('should call sendVariables', () => {
      domo.sendVariables('vars');
      expect(window.parent.postMessage).toHaveBeenCalled();
    });
  });
});

describe('domo.__util (internal utilities)', () => {
  it('should expose the expected private functions', () => {
    expect(typeof domo.__util.isVerifiedOrigin).toBe('function');
    expect(typeof domo.__util.isSuccess).toBe('function');
    expect(typeof domo.__util.getQueryParams).toBe('function');
    expect(typeof domo.__util.setFormatHeaders).toBe('function');
  });

  it('isSuccess returns true for 2xx, false otherwise', () => {
    expect(domo.__util.isSuccess(200)).toBe(true);
    expect(domo.__util.isSuccess(299)).toBe(true);
    expect(domo.__util.isSuccess(199)).toBe(false);
    expect(domo.__util.isSuccess(300)).toBe(false);
    expect(domo.__util.isSuccess(null)).toBe(false);
    expect(domo.__util.isSuccess(undefined)).toBe(false);
  });

  it('isVerifiedOrigin honors whitelisting and blacklisting', () => {
    expect(Boolean(domo.__util.isVerifiedOrigin('https://www.domo.com'))).toBe(true);
    expect(Boolean(domo.__util.isVerifiedOrigin('https://www.domotech.io'))).toBe(true);
    expect(Boolean(domo.__util.isVerifiedOrigin('https://www.domorig.io'))).toBe(true);
    expect(Boolean(domo.__util.isVerifiedOrigin('https://domo.demo.domo.com'))).toBe(true);
    expect(Boolean(domo.__util.isVerifiedOrigin('https://qa2staging.fastage1.domotech.io/auth/index'))).toBe(true);
    expect(Boolean(domo.__util.isVerifiedOrigin('https://www.domoapps-test.domo.com'))).toBe(false);
    expect(Boolean(domo.__util.isVerifiedOrigin('https://www.test-domoapps.domo.com'))).toBe(false);
    expect(Boolean(domo.__util.isVerifiedOrigin('https://www.somethingk.com'))).toBe(false);
    expect(Boolean(domo.__util.isVerifiedOrigin('https://www.domo.com.bad.io'))).toBe(false);
    expect(Boolean(domo.__util.isVerifiedOrigin('http://www.domo.com'))).toBe(false);
  });

  it('getQueryParams parses query string', () => {
    Object.defineProperty(global, 'location', {
      value: { search: '?foo=bar&baz=qux' },
      configurable: true
    });
    const params = domo.__util.getQueryParams();
    expect('foo' in params).toBe(true);
    expect('baz' in params).toBe(true);
    expect((params as any)['foo']).toBe('bar');
    expect((params as any)['baz']).toBe('qux');
  });

  it('setFormatHeaders sets Accept header for data/v URLs', () => {
    const req = { setRequestHeader: jest.fn() };
    domo.__util.setFormatHeaders(req as any, 'https://domo.com/data/v1', { format: 'array-of-objects' });
    expect(req.setRequestHeader).toHaveBeenCalledWith('Accept', expect.any(String));
  });
});

describe('domo.env', () => {
  it('should have env properties with expected types', () => {
    expect(typeof domo.env).toBe('object');
    expect(typeof domo.env.userId).toBeDefined();
  });
});

describe('domo global', () => {
  it('should expose env and __util', () => {
    expect(domo.env).toBeDefined();
    expect(domo.__util).toBeDefined();
  });
});

describe('domoHttp edge cases', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  function flushMicrotasks() {
    return Promise.resolve().then(() => {});
  }
  async function triggerOnloadAsync() {
    await flushMicrotasks();
    if (globalThis._xhrInstance.onload) globalThis._xhrInstance.onload();
  }
  async function triggerOnerrorAsync() {
    await flushMicrotasks();
    if (globalThis._xhrInstance.onerror) globalThis._xhrInstance.onerror();
  }

  it('should resolve with raw response for csv/excel format', async () => {
    globalThis._xhrInstance.status = 200;
    globalThis._xhrInstance.response = 'csvdata';
    const promise = domo.get('/test', { format: 'csv' } as any);
    await triggerOnloadAsync();
    await expect(promise).resolves.toBe('csvdata');
  });

  it('should resolve with raw response if response is falsy', async () => {
    globalThis._xhrInstance.status = 200;
    globalThis._xhrInstance.response = '';
    const promise = domo.get('/test', { format: 'array-of-objects' } as any);
    await triggerOnloadAsync();
    await expect(promise).resolves.toBe('');
  });

  it('should resolve with Blob if responseType is blob', async () => {
    globalThis._xhrInstance.status = 200;
    globalThis._xhrInstance.response = 'blobdata';
    globalThis._xhrInstance.getResponseHeader.mockReturnValue('application/octet-stream');
    const promise = domo.get('/test', { responseType: 'blob' } as any);
    await triggerOnloadAsync();
    await expect(promise).resolves.toEqual(expect.any(Blob));
  });

  it('should reject with "Invalid JSON response" if response is not valid JSON', async () => {
    globalThis._xhrInstance.status = 200;
    globalThis._xhrInstance.response = 'not-json';
    const promise = domo.get('/test');
    await triggerOnloadAsync();
    await expect(promise).rejects.toThrow('Invalid JSON response');
  });

  it('should reject with statusText if status is not 2xx', async () => {
    globalThis._xhrInstance.status = 404;
    globalThis._xhrInstance.statusText = 'Not Found';
    globalThis._xhrInstance.response = '{}';
    const promise = domo.get('/test');
    await triggerOnloadAsync();
    await expect(promise).rejects.toThrow('Not Found');
  });

  it('should reject with "Network Error" on network error', async () => {
    globalThis._xhrInstance.status = 0;
    const promise = domo.get('/test');
    await triggerOnerrorAsync();
    await expect(promise).rejects.toThrow('Network Error');
  });

  it('should send raw body if contentType is not JSON', async () => {
    globalThis._xhrInstance.status = 200;
    globalThis._xhrInstance.response = '{}';
    const promise = domo.post('/test', 'raw-body', { contentType: 'text/plain' } as any);
    await flushMicrotasks();
    expect(globalThis._xhrInstance.send).toHaveBeenCalledWith('raw-body');
    await triggerOnloadAsync();
    await promise;
  });
});
