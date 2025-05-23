import domo from "../../domo";

describe("Dataset Service", () => {
  beforeEach(() => {
    window.parent.postMessage = jest.fn();
  });

  it("should log a warning in _sharedOnDataUpdateListener if not test env", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const event = new MessageEvent("message", {
      data: "{invalidJson",
      origin: "https://www.domo.com",
    });

    Object.defineProperty(event, "source", {
      value: { postMessage: jest.fn() },
    });
    
    (domo as any)._sharedOnDataUpdateListener(event);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  it('should return early if message does not have alias property', () => {
    const event = new MessageEvent('message', {
      data: JSON.stringify({ foo: 'bar' }),
      origin: 'https://www.domo.com',
    });
    (domo as any)._sharedOnDataUpdateListener(event);
    expect(window.parent.postMessage).not.toHaveBeenCalled();
  });

  it('should return early if event.origin is not verified in _sharedOnDataUpdateListener', () => {
    const cb = jest.fn();
    domo.onDataUpdate(cb);
    const event = new MessageEvent('message', {
      data: JSON.stringify({ alias: 'test-alias' }),
      origin: 'https://untrusted.com',
    });
    Object.defineProperty(event, 'source', { value: { postMessage: jest.fn() } });
    (domo as any)._sharedOnDataUpdateListener(event);
    expect(cb).not.toHaveBeenCalled();
    // Should not send ack
    expect(event.source.postMessage).not.toHaveBeenCalled();
  });

  it('should not throw if process/env is undefined in _sharedOnDataUpdateListener', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const originalProcess = global.process;
    global.process = undefined as any; // Instead of deleting, set to undefined
    const event = new MessageEvent('message', {
      data: '{invalidJson',
      origin: 'https://www.domo.com',
    });
    Object.defineProperty(event, 'source', { value: { postMessage: jest.fn() } });
    expect(() => (domo as any)._sharedOnDataUpdateListener(event)).not.toThrow();
    global.process = originalProcess;
    warnSpy.mockRestore();
  });
});
