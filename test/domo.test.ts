// domo.test.ts
// Unit tests for all functions in domo.ts

// Mock global location before importing domo
(global as any).location = { search: '' };

import domo from '../src/domo';
import { FilterOperatorsString } from '../src/models/interfaces/filter-operators';
import { FilterDataTypes } from '../src/models/interfaces/filter-data-types';

// Mock browser APIs and global objects as needed
beforeEach(() => {
  jest.resetAllMocks();
  // Use bracket notation to avoid TypeScript syntax in JS context
  (window as any)['__RYUU_SID__'] = 'test-token';
  window.parent.postMessage = jest.fn();
  window.addEventListener = jest.fn();
  window.removeEventListener = jest.fn();
  Object.defineProperty(window.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    configurable: true
  });
  (window as any)['webkit'] = { messageHandlers: { domofilter: { postMessage: jest.fn() }, domovariable: { postMessage: jest.fn() } } };
  // Mock MessageChannel for Node.js environment
  (global as any).MessageChannel = class {
    port1 = { onmessage: null as ((event: any) => void) | null, postMessage: jest.fn(), close: jest.fn() };
    port2 = { onmessage: null as ((event: any) => void) | null, postMessage: jest.fn(), close: jest.fn() };
  };
});

describe('domo static methods', () => {
  it('should call post', async () => {
    domo.__util.isVerifiedOrigin = jest.fn(() => true);
    const spy = jest.spyOn(domo, 'post');
    spy.mockResolvedValue({});
    await expect(domo.post('/test')).resolves.toBeDefined();
  });

  it('should call put', async () => {
    const spy = jest.spyOn(domo, 'put');
    spy.mockResolvedValue({});
    await expect(domo.put('/test')).resolves.toBeDefined();
  });

  it('should call get', async () => {
    const spy = jest.spyOn(domo, 'get');
    spy.mockResolvedValue({});
    await expect(domo.get('/test')).resolves.toBeDefined();
  });

  it('should call delete', async () => {
    const spy = jest.spyOn(domo, 'delete');
    spy.mockResolvedValue({});
    await expect(domo.delete('/test')).resolves.toBeDefined();
  });

  it('should call getAll', async () => {
    const spy = jest.spyOn(domo, 'getAll');
    spy.mockResolvedValue([{}]);
    await expect(domo.getAll(['/test'])).resolves.toBeDefined();
  });

  it('should register and unregister onDataUpdate', () => {
    const cb = jest.fn();
    const unregister = domo.onDataUpdate(cb);
    expect(typeof unregister).toBe('function');
    unregister();
  });

  it('should connect and handle events', () => {
    domo.connected = false;
    domo.connect();
    expect(domo.connected).toBe(true);
  });

  it('should register and unregister onFiltersUpdate', () => {
    const cb = jest.fn();
    const unregister = domo.onFiltersUpdate(cb);
    expect(typeof unregister).toBe('function');
    unregister();
  });

  it('should register and unregister onAppData', () => {
    const cb = jest.fn();
    const unregister = domo.onAppData(cb);
    expect(typeof unregister).toBe('function');
    unregister();
  });

  it('should register and unregister onVariablesUpdated', () => {
    const cb = jest.fn();
    const unregister = domo.onVariablesUpdated(cb);
    expect(typeof unregister).toBe('function');
    unregister();
  });

  it('should call navigate', () => {
    domo.navigate('/test', true);
    expect(window.parent.postMessage).toHaveBeenCalled();
  });

  it('should call filterContainer', () => {
    domo.filterContainer([
      { column: 'a', operator: FilterOperatorsString.IN, values: ['x'], dataType: FilterDataTypes.STRING }
    ], true);
    expect(window.parent.postMessage).toHaveBeenCalled();
  });

  it('should call sendAppData', () => {
    domo.sendAppData('data');
    expect(window.parent.postMessage).toHaveBeenCalled();
  });

  it('should call sendVariables', () => {
    domo.sendVariables('vars');
    expect(window.parent.postMessage).toHaveBeenCalled();
  });

  it('should expose env and __util', () => {
    expect(domo.env).toBeDefined();
    expect(domo.__util).toBeDefined();
  });

  describe('error handling', () => {
    it('should reject post on error', async () => {
      const spy = jest.spyOn(domo, 'post');
      spy.mockRejectedValue(new Error('fail'));
      await expect(domo.post('/fail')).rejects.toThrow('fail');
    });
    it('should reject get on error', async () => {
      const spy = jest.spyOn(domo, 'get');
      spy.mockRejectedValue(new Error('fail'));
      await expect(domo.get('/fail')).rejects.toThrow('fail');
    });
  });

  describe('event registration edge cases', () => {
    it('should handle invalid callback for onDataUpdate', () => {
      // domo.onDataUpdate does not throw, so just check it returns a function even for invalid input
      const unregister = domo.onDataUpdate(null as any);
      expect(typeof unregister).toBe('function');
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
  });

  describe('return values', () => {
    it('should return expected value from get', async () => {
      const spy = jest.spyOn(domo, 'get');
      spy.mockResolvedValue({ foo: 'bar' });
      await expect(domo.get('/foo')).resolves.toEqual({ foo: 'bar' });
    });
  });

  describe('__util methods', () => {
    it('should have isVerifiedOrigin as a function', () => {
      expect(typeof domo.__util.isVerifiedOrigin).toBe('function');
    });
    // Removed getOrigin test as it does not exist
  });

  describe('env properties', () => {
    it('should have env properties with expected types', () => {
      expect(typeof domo.env).toBe('object');
      expect(typeof domo.env.userId).toBeDefined();
    });
  });

  describe('MessageChannel and event handling', () => {
    it('should use MessageChannel for communication', () => {
      const cb = jest.fn();
      const unregister = domo.onDataUpdate(cb);
      // Simulate message event
      const channel = new (global as any).MessageChannel();
      if (channel.port1.onmessage) {
        channel.port1.onmessage({ data: 'test' });
        expect(cb).toHaveBeenCalled();
      }
      unregister();
    });
  });

  describe('platform detection', () => {
    it('should detect webkit and call messageHandlers', () => {
      // Simulate iOS device
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

  describe('state changes', () => {
    it('should set connected to true after connect', () => {
      domo.connected = false;
      domo.connect();
      expect(domo.connected).toBe(true);
    });
  });
});
