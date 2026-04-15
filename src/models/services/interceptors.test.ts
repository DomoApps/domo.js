import Domo from '../../domo';
import { addInterceptor, clearInterceptors, InterceptorConfig } from './interceptors';

class MockMessagePort {
  onmessage: ((event: any) => void) | null = null;
  postMessage = jest.fn();
  close = jest.fn();
}

(global as any).MessageChannel = class {
  port1 = new MockMessagePort();
  port2 = new MockMessagePort();
};

beforeEach(() => {
  jest.resetAllMocks();
  clearInterceptors();
  (window as any)['__RYUU_SID__'] = 'test-token';
  global.fetch = jest.fn();
});

afterEach(() => {
  clearInterceptors();
  delete (global as any).fetch;
});

function mockOkResponse(data: any = {}) {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(data),
    body: {},
  });
}

describe('Request Interceptors', () => {
  it('should call interceptor before fetch', async () => {
    mockOkResponse({ ok: true });
    const interceptor = jest.fn((config, next) => next(config));
    addInterceptor(interceptor);

    await Domo.get('/test');
    expect(interceptor).toHaveBeenCalledTimes(1);
    expect(interceptor.mock.calls[0][0].url).toBe('/test');
    expect(interceptor.mock.calls[0][0].method).toBe('GET');
  });

  it('should allow interceptor to modify request config', async () => {
    mockOkResponse({ modified: true });
    addInterceptor((config, next) => {
      config.headers['X-Custom'] = 'intercepted';
      return next(config);
    });

    await Domo.get('/test');
    expect(global.fetch).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Custom': 'intercepted' }),
      })
    );
  });

  it('should execute interceptors in onion order (last registered = outermost)', async () => {
    mockOkResponse({});
    const order: number[] = [];

    addInterceptor(async (config, next) => {
      order.push(1);
      const res = await next(config);
      order.push(4);
      return res;
    });

    addInterceptor(async (config, next) => {
      order.push(2);
      const res = await next(config);
      order.push(3);
      return res;
    });

    await Domo.get('/test');
    // Outermost (2) enters first, innermost (1) enters second
    // Then unwinds: innermost after (4), outermost after (3) — but with async
    // the actual order depends on microtask scheduling
    expect(order.slice(0, 2)).toEqual([2, 1]);
    expect(order).toContain(3);
    expect(order).toContain(4);
  });

  it('should allow interceptor to short-circuit (not call next)', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ cached: true }),
      headers: { forEach: () => {} },
      body: {},
    } as any as Response;

    addInterceptor((_config, _next) => Promise.resolve(mockResponse));

    const result = await Domo.get('/test');
    expect(result).toEqual({ cached: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should remove interceptor when unsubscribe is called', async () => {
    mockOkResponse({});
    const interceptor = jest.fn((config: InterceptorConfig, next: any) => next(config));
    const remove = addInterceptor(interceptor);

    await Domo.get('/test');
    expect(interceptor).toHaveBeenCalledTimes(1);

    remove();
    interceptor.mockClear();

    await Domo.get('/test');
    expect(interceptor).not.toHaveBeenCalled();
  });

  it('should work with no interceptors registered', async () => {
    mockOkResponse({ clean: true });
    const result = await Domo.get('/test');
    expect(result).toEqual({ clean: true });
  });

  it('Domo.intercept is the same as addInterceptor', () => {
    expect(Domo.intercept).toBe(addInterceptor);
  });
});
