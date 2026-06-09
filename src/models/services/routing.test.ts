import { initRouteCapture } from './routing';

describe('initRouteCapture', () => {
  let stop: () => void;

  beforeEach(() => {
    jest.useFakeTimers();
    window.parent.postMessage = jest.fn();
    stop = initRouteCapture();
  });

  afterEach(() => {
    stop();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('sends ROUTE_CHANGE after pushState', () => {
    history.pushState({}, '', '/new-path');
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      JSON.stringify({ type: 'ROUTE_CHANGE', route: '/new-path' }),
      '*'
    );
  });

  it('sends ROUTE_CHANGE after replaceState', () => {
    history.replaceState({}, '', '/replaced');
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      JSON.stringify({ type: 'ROUTE_CHANGE', route: '/replaced' }),
      '*'
    );
  });

  it('sends ROUTE_CHANGE on popstate', () => {
    window.dispatchEvent(new PopStateEvent('popstate'));
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalled();
  });

  it('sends ROUTE_CHANGE on hashchange', () => {
    window.dispatchEvent(new Event('hashchange'));
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalled();
  });

  it('debounces rapid pushState calls into a single message', () => {
    history.pushState({}, '', '/path1');
    history.pushState({}, '', '/path2');
    history.pushState({}, '', '/path3');
    expect(window.parent.postMessage).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalledTimes(1);
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
      JSON.stringify({ type: 'ROUTE_CHANGE', route: '/page?q=test#section' }),
      '*'
    );
  });

  it('stop() prevents further ROUTE_CHANGE messages', () => {
    stop();
    (window.parent.postMessage as jest.Mock).mockClear();
    history.pushState({}, '', '/after-stop');
    window.dispatchEvent(new PopStateEvent('popstate'));
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).not.toHaveBeenCalled();
  });
});
