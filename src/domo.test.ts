import Domo, { __mutationObserverCallback } from './domo';
import { RequestMethods } from './models/enums/request-methods';

const originalDomoHttp = Domo.domoHttp;
const originalGet = Domo.get;
const originalPost = Domo.post;
const originalPut = Domo.put;
const originalDelete = Domo.delete;

class MockMessagePort {
  onmessage: ((event: any) => void) | null = null;
  postMessage = jest.fn();
  close = jest.fn();
}
(global as any).MessageChannel = class {
  port1 = new MockMessagePort();
  port2 = new MockMessagePort();
};

// Mock browser APIs and global objects as needed
beforeEach(() => {
  jest.resetAllMocks();
  (window as any)['__RYUU_SID__'] = 'test-token';

  Domo.domoHttp = originalDomoHttp;
  Domo.get = originalGet;
  Domo.post = originalPost;
  Domo.put = originalPut;
  Domo.delete = originalDelete;
});

describe('Domo Connect & MessageChannel', () => {
  let appDataSpy: jest.Mock, 
      filtersSpy: jest.Mock, 
      variablesSpy: jest.Mock;

  beforeEach(() => {
    Domo.listeners.onAppDataUpdated = [];
    Domo.listeners.onFiltersUpdated = [];
    Domo.listeners.onVariablesUpdated = [];

    appDataSpy = jest.fn();
    filtersSpy = jest.fn();
    variablesSpy = jest.fn();
  
    Domo.listeners.onAppDataUpdated.push(appDataSpy);
    Domo.listeners.onFiltersUpdated.push(filtersSpy);
    Domo.listeners.onVariablesUpdated.push(variablesSpy);
  });

  function makeMessageEvent(data: any, ports: any[] = []) {
    return { data, ports } as any;
  }

  it('should early return if responsePort is undefined', () => {
    const data = { event: 'filtersUpdated', filters: [] } as any;
    (Domo as any).connect();
    expect(() => Domo.channel?.port1?.onmessage?.(makeMessageEvent(data, []))).not.toThrow();
  });
  
  it('should handle multiple messages correctly', () => {
    const channel = new MessageChannel();
    const data1 = { event: 'filtersUpdated', filters: [] } as any;
    const data2 = { event: 'appData', data: {} } as any;
    const data3 = { event: 'variablesUpdated', variables: {} } as any;

    expect(() => Domo.channel?.port1?.onmessage?.(makeMessageEvent(data1, [channel.port2]))).not.toThrow();
    expect(() => Domo.channel?.port1?.onmessage?.(makeMessageEvent(data2, [channel.port2]))).not.toThrow();
    expect(() => Domo.channel?.port1?.onmessage?.(makeMessageEvent(data3, [channel.port2]))).not.toThrow();
    expect(variablesSpy).toHaveBeenCalled();
    expect(filtersSpy).toHaveBeenCalled();
    expect(appDataSpy).toHaveBeenCalled();
    expect(channel.port2.postMessage).toHaveBeenCalledTimes(3);
  });
});


describe('domo.__util (internal utilities)', () => {
  it('should expose the expected private functions', () => {
    expect(typeof Domo.__util.isVerifiedOrigin).toBe('function');
    expect(typeof Domo.__util.isSuccess).toBe('function');
    expect(typeof Domo.__util.getQueryParams).toBe('function');
    expect(typeof Domo.__util.setFormatHeaders).toBe('function');
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


describe('Domo.extend', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('should override a static method and call the new implementation', async () => {
    const mockGet = jest.fn().mockResolvedValue('mocked');
    Domo.extend({ get: mockGet });
    const result = await Domo.get('/foo');
    expect(mockGet).toHaveBeenCalledWith('/foo');
    expect(result).toBe('mocked');
  });

  it('should not override non-existent static properties', () => {
    const before = (Domo as any).nonExistent;
    Domo.extend({ nonExistent: 'value' } as any);
    expect((Domo as any).nonExistent).toBe(before);
  });

  it('should allow multiple overrides at once', async () => {
    const mockGet = jest.fn().mockResolvedValue('mocked-get');
    const mockPost = jest.fn().mockResolvedValue('mocked-post');
    Domo.extend({ get: mockGet, post: mockPost });
    expect(await Domo.get('/foo')).toBe('mocked-get');
    expect(await Domo.post('/bar')).toBe('mocked-post');
  });

  it('should properly override the domoHttp method', async () => {
    const mockHttp = jest.fn().mockResolvedValue('mocked-http');
    Domo.extend({ domoHttp: mockHttp });
    const result = await Domo.domoHttp(RequestMethods.GET, '/baz');
    expect(mockHttp).toHaveBeenCalledWith('GET', '/baz');
    expect(result).toBe('mocked-http');
    mockHttp.mockClear();
    
    const getResult = await Domo.get('/qux');
    expect(mockHttp).toHaveBeenCalled();
    expect(getResult).toBe('mocked-http');
    mockHttp.mockClear();

    const postResult = await Domo.post('/quux', { body: {} });
    expect(mockHttp).toHaveBeenCalledWith('POST', '/quux', undefined, { body: {} });
    expect(postResult).toBe('mocked-http');
    mockHttp.mockClear();

    const putResult = await Domo.put('/corge', { body: {} });
    expect(mockHttp).toHaveBeenCalledWith('PUT', '/corge', undefined, { body: {} });
    expect(putResult).toBe('mocked-http');
    mockHttp.mockClear();

    const deleteResult = await Domo.delete('/grault');
    expect(mockHttp).toHaveBeenCalledWith('DELETE', '/grault', undefined);
    expect(deleteResult).toBe('mocked-http');
  });
});
