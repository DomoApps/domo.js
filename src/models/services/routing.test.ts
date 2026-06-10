import { initRouteCapture } from './routing';

describe('initRouteCapture', () => {
  let stop: () => void;

  beforeEach(() => {
    jest.useFakeTimers();
    // Reset location to ensure clean test state
    window.history.replaceState({}, '', '/');
    window.parent.postMessage = jest.fn();
    stop = initRouteCapture();
  });

  afterEach(() => {
    stop();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('sends routeChange after pushState', () => {
    history.pushState({}, '', '/new-path');
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      JSON.stringify({ event: 'routeChange', route: '/new-path' }),
      '*'
    );
  });

  it('sends routeChange after replaceState', () => {
    history.replaceState({}, '', '/replaced');
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      JSON.stringify({ event: 'routeChange', route: '/replaced' }),
      '*'
    );
  });

  it('sends routeChange on popstate', () => {
    window.dispatchEvent(new PopStateEvent('popstate'));
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      JSON.stringify({ event: 'routeChange', route: '/' }),
      '*'
    );
  });

  it('sends routeChange on hashchange', () => {
    window.dispatchEvent(new Event('hashchange'));
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      JSON.stringify({ event: 'routeChange', route: '/' }),
      '*'
    );
  });

  it('debounces rapid pushState calls into a single message', () => {
    history.pushState({}, '', '/path1');
    history.pushState({}, '', '/path2');
    history.pushState({}, '', '/path3');
    expect(window.parent.postMessage).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalledTimes(1);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      JSON.stringify({ event: 'routeChange', route: '/path3' }),
      '*'
    );
  });

  it('sends separate messages for calls more than 100ms apart', () => {
    history.pushState({}, '', '/first');
    jest.advanceTimersByTime(100);
    history.pushState({}, '', '/second');
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalledTimes(2);
  });

  it('includes pathname, search, and hash in route', () => {
    history.pushState({}, '', '/page?q=test#section');
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      JSON.stringify({ event: 'routeChange', route: '/page?q=test#section' }),
      '*'
    );
  });

  it('stop() prevents further routeChange messages', () => {
    stop();
    (window.parent.postMessage as jest.Mock).mockClear();
    history.pushState({}, '', '/after-stop');
    history.replaceState({}, '', '/after-stop-replace');
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.dispatchEvent(new Event('hashchange'));
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).not.toHaveBeenCalled();
  });
});

describe('directLinkRoute restore', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    jest.clearAllMocks();
  });

  it('restores URL from directLinkRoute param without emitting routeChange', () => {
    window.history.replaceState({}, '', '/?directLinkRoute=%2Fpage2');
    window.parent.postMessage = jest.fn();
    jest.useFakeTimers();
    const stop = initRouteCapture();
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/page2');
    expect(window.location.search).toBe('');
    stop();
    jest.useRealTimers();
  });

  it('after restore, further pushState still emits routeChange', () => {
    window.history.replaceState({}, '', '/?directLinkRoute=%2Fpage2');
    window.parent.postMessage = jest.fn();
    jest.useFakeTimers();
    const stop = initRouteCapture();
    history.pushState({}, '', '/page3');
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      JSON.stringify({ event: 'routeChange', route: '/page3' }),
      '*'
    );
    stop();
    jest.useRealTimers();
  });

  it('no directLinkRoute param leaves URL unchanged', () => {
    window.history.replaceState({}, '', '/');
    window.parent.postMessage = jest.fn();
    jest.useFakeTimers();
    const stop = initRouteCapture();
    jest.advanceTimersByTime(100);
    expect(window.location.pathname).toBe('/');
    expect(window.parent.postMessage).not.toHaveBeenCalled();
    stop();
    jest.useRealTimers();
  });
});
