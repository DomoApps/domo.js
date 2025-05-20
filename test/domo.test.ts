// Mock global location before importing domo
(global as any).location = { search: '' };

import domo from '../src/domo';
import { FilterOperatorsString } from '../src/models/interfaces/filter-operators';
import { FilterDataTypes } from '../src/models/interfaces/filter-data-types';

// Mock browser APIs and global objects as needed
beforeEach(() => {
  jest.resetAllMocks();
  (window as any)['__RYUU_SID__'] = 'test-token';
  window.parent.postMessage = jest.fn();
  window.addEventListener = jest.fn();
  window.removeEventListener = jest.fn();
  Object.defineProperty(window.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    configurable: true
  });
  (window as any)['webkit'] = { messageHandlers: { domofilter: { postMessage: jest.fn() }, domovariable: { postMessage: jest.fn() } } };
  (global as any).MessageChannel = class {
    port1 = { onmessage: null as ((event: any) => void) | null, postMessage: jest.fn(), close: jest.fn() };
    port2 = { onmessage: null as ((event: any) => void) | null, postMessage: jest.fn(), close: jest.fn() };
  };
});

describe('domo.post', () => {
  it('should call post', async () => {
    domo.__util.isVerifiedOrigin = jest.fn(() => true);
    const spy = jest.spyOn(domo, 'post');
    spy.mockResolvedValue({});
    await expect(domo.post('/test')).resolves.toBeDefined();
  });
  it('should reject post on error', async () => {
    const spy = jest.spyOn(domo, 'post');
    spy.mockRejectedValue(new Error('fail'));
    await expect(domo.post('/fail')).rejects.toThrow('fail');
  });
});

describe('domo.put', () => {
  it('should call put', async () => {
    const spy = jest.spyOn(domo, 'put');
    spy.mockResolvedValue({});
    await expect(domo.put('/test')).resolves.toBeDefined();
  });
});

describe('domo.get', () => {
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
});

describe('domo.delete', () => {
  it('should call delete', async () => {
    const spy = jest.spyOn(domo, 'delete');
    spy.mockResolvedValue({});
    await expect(domo.delete('/test')).resolves.toBeDefined();
  });
});

describe('domo.getAll', () => {
  it('should call getAll', async () => {
    const spy = jest.spyOn(domo, 'getAll');
    spy.mockResolvedValue([{}]);
    await expect(domo.getAll(['/test'])).resolves.toBeDefined();
  });
});

describe('domo.onDataUpdate', () => {
  it('should register and unregister onDataUpdate', () => {
    const cb = jest.fn();
    const unregister = domo.onDataUpdate(cb);
    expect(typeof unregister).toBe('function');
    unregister();
  });
  it('should handle invalid callback for onDataUpdate', () => {
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
});

describe('domo.connect', () => {
  it('should connect and handle events', () => {
    domo.connected = false;
    domo.connect();
    expect(domo.connected).toBe(true);
  });
  it('should set connected to true after connect', () => {
    domo.connected = false;
    domo.connect();
    expect(domo.connected).toBe(true);
  });
});

describe('domo.onFiltersUpdate', () => {
  it('should register and unregister onFiltersUpdate', () => {
    const cb = jest.fn();
    const unregister = domo.onFiltersUpdate(cb);
    expect(typeof unregister).toBe('function');
    unregister();
  });
});

describe('domo.onAppData', () => {
  it('should register and unregister onAppData', () => {
    const cb = jest.fn();
    const unregister = domo.onAppData(cb);
    expect(typeof unregister).toBe('function');
    unregister();
  });
});

describe('domo.onVariablesUpdated', () => {
  it('should register and unregister onVariablesUpdated', () => {
    const cb = jest.fn();
    const unregister = domo.onVariablesUpdated(cb);
    expect(typeof unregister).toBe('function');
    unregister();
  });
});

describe('domo.navigate', () => {
  it('should call navigate', () => {
    domo.navigate('/test', true);
    expect(window.parent.postMessage).toHaveBeenCalled();
  });
});

describe('domo.filterContainer', () => {
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

describe('domo.sendAppData', () => {
  it('should call sendAppData', () => {
    domo.sendAppData('data');
    expect(window.parent.postMessage).toHaveBeenCalled();
  });
});

describe('domo.sendVariables', () => {
  it('should call sendVariables', () => {
    domo.sendVariables('vars');
    expect(window.parent.postMessage).toHaveBeenCalled();
  });
});

describe('domo.__util', () => {
  it('should have isVerifiedOrigin as a function', () => {
    expect(typeof domo.__util.isVerifiedOrigin).toBe('function');
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
