import { domoDebug } from './debug';

describe('DomoDebug', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    domoDebug.disable();
    consoleSpy = jest.spyOn(console, 'debug').mockImplementation();
    try { localStorage.removeItem('__domo_debug__'); } catch {}
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    domoDebug.disable();
  });

  it('does not log when disabled', () => {
    domoDebug.log('http', 'test');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('logs when enabled with matching category', () => {
    domoDebug.enable(['http']);
    domoDebug.log('http', 'GET', '/api/data');
    expect(consoleSpy).toHaveBeenCalledWith('[domo:http]', 'GET', '/api/data');
  });

  it('does not log non-matching categories', () => {
    domoDebug.enable(['http']);
    domoDebug.log('filters', 'should not appear');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('logs all categories when "all" is enabled', () => {
    domoDebug.enable(['all']);
    domoDebug.log('http', 'test1');
    domoDebug.log('filters', 'test2');
    domoDebug.log('variables', 'test3');
    expect(consoleSpy).toHaveBeenCalledTimes(3);
  });

  it('defaults to "all" when enable() called with no args', () => {
    domoDebug.enable();
    domoDebug.log('messages', 'test');
    expect(consoleSpy).toHaveBeenCalledWith('[domo:messages]', 'test');
  });

  it('disable() stops logging', () => {
    domoDebug.enable();
    domoDebug.disable();
    domoDebug.log('http', 'should not appear');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('persists to localStorage on enable', () => {
    domoDebug.enable(['http', 'filters']);
    const stored = localStorage.getItem('__domo_debug__');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed).toContain('http');
    expect(parsed).toContain('filters');
  });

  it('removes from localStorage on disable', () => {
    domoDebug.enable();
    domoDebug.disable();
    expect(localStorage.getItem('__domo_debug__')).toBeNull();
  });

  it('exposes enabled flag', () => {
    expect(domoDebug.enabled).toBe(false);
    domoDebug.enable();
    expect(domoDebug.enabled).toBe(true);
    domoDebug.disable();
    expect(domoDebug.enabled).toBe(false);
  });

  it('handles multiple categories', () => {
    domoDebug.enable(['http', 'filters']);
    domoDebug.log('http', 'request');
    domoDebug.log('filters', 'update');
    domoDebug.log('variables', 'skip me');
    expect(consoleSpy).toHaveBeenCalledTimes(2);
  });

  it('log passes all args to console.debug', () => {
    domoDebug.enable();
    const obj = { method: 'GET', url: '/test' };
    domoDebug.log('http', 'request', obj, 42);
    expect(consoleSpy).toHaveBeenCalledWith('[domo:http]', 'request', obj, 42);
  });

  it('handles localStorage being unavailable gracefully', () => {
    const orig = localStorage.setItem;
    localStorage.setItem = () => { throw new Error('quota exceeded'); };
    expect(() => domoDebug.enable()).not.toThrow();
    expect(domoDebug.enabled).toBe(true);
    localStorage.setItem = orig;
  });
});
