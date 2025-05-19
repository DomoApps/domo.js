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
});
