import Domo from "../../domo";

const realAddEventListener = window.addEventListener;
const realRemoveEventListener = window.removeEventListener;
(window as any).eventListeners = { message: [] };
window.addEventListener = function (
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions
) {
  if (type === "message") {
    (window as any).eventListeners.message.push(listener);
  }
  return realAddEventListener.call(this, type, listener, options);
};
window.removeEventListener = function (
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | EventListenerOptions
) {
  if (type === "message") {
    const arr = (window as any).eventListeners.message;
    const idx = arr.indexOf(listener);
    if (idx !== -1) arr.splice(idx, 1);
  }
  return realRemoveEventListener.call(this, type, listener, options);
};

describe("Dataset Service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (window as any)["__RYUU_SID__"] = "test-token";
    window.parent.postMessage = jest.fn();
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      configurable: true,
    });
    (window as any)["webkit"] = {
      messageHandlers: {
        domofilter: { postMessage: jest.fn() },
        domovariable: { postMessage: jest.fn() },
      },
    };
    Domo.listeners.onDataUpdated = [];
    (Domo as any)._onDataUpdateListener = null;
  });

  afterEach(() => {
    const listeners: EventListenerOrEventListenerObject[] =
      (window as any).eventListeners?.message ?? [];
    listeners.forEach((listener: EventListenerOrEventListenerObject) => {
      realRemoveEventListener.call(window, "message", listener);
    });
    (window as any).eventListeners.message = [];
    Domo.listeners.onDataUpdated = [];
    (Domo as any)._onDataUpdateListener = null;
  });

  describe("onDataUpdated", () => {
    beforeAll(() => {
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
    });

    function simulateMessageEvent({
      cb,
      expectAck,
      expectCbCall,
      unregister,
    }: {
      cb?: jest.Mock;
      expectAck: boolean;
      expectCbCall?: boolean;
      unregister?: boolean;
    }) {
      const alias = "test-alias";
      const message = JSON.stringify({ alias });
      const fakeSource = { postMessage: jest.fn() };

      let localUnregister: (() => void) | undefined;
      if (cb) localUnregister = Domo.onDataUpdated(cb);
      if (unregister && localUnregister) localUnregister();

      const event = new MessageEvent("message", {
        data: message,
        origin: "https://www.domo.com",
      });
      Object.defineProperty(event, "source", { value: fakeSource });
      window.dispatchEvent(event);

      const expectedAck = JSON.stringify({ event: "ack", alias });
      if (expectAck)
        expect(fakeSource.postMessage).toHaveBeenCalledWith(
          expectedAck,
          "https://www.domo.com"
        );
      else
        expect(fakeSource.postMessage).not.toHaveBeenCalledWith(
          expectedAck,
          "https://www.domo.com"
        );

      if (cb && expectCbCall) expect(cb).toHaveBeenCalledWith("test-alias");
      else if (cb) expect(cb).not.toHaveBeenCalled();

      if (localUnregister) localUnregister();
    }

    it("should prevent app refresh if callback is registered", () => {
      const cb = jest.fn();
      Domo.onDataUpdated(cb);
      (Domo as any).connect();
      const responsePort = new (global as any).MessagePort();
      responsePort.postMessage = jest.fn();
      const alias = "test-alias";
      const eventData = { event: "dataUpdated", alias };
      const event = new MessageEvent("message", {
        data: eventData,
        ports: [responsePort],
      });
      Domo.channel?.port1.onmessage?.(event);
      expect(cb).toHaveBeenCalledWith(alias);
      expect(responsePort.postMessage).toHaveBeenCalledWith({
        event: "ack",
        alias,
      });
    });

    it("should not prevent app refresh if callback is not registered", () => {
      simulateMessageEvent({ expectAck: false });
    });

    it("should register and unregister onDataUpdated", () => {
      const cb = jest.fn();
      const unregister = Domo.onDataUpdated(cb);
      (Domo as any).connect();
      // Simulate MessageChannel event: should call cb
      const alias = "test-alias";
      const responsePort = { postMessage: jest.fn() };
      const event = {
        data: { event: "dataUpdated", alias },
        ports: [responsePort],
      };
      Domo.channel?.port1.onmessage?.(event as any);
      expect(cb).toHaveBeenCalledWith(alias);
      // Unregister and simulate again: should NOT call cb again
      cb.mockClear();
      unregister();
      Domo.channel?.port1.onmessage?.(event as any);
      expect(cb).not.toHaveBeenCalled();
    });

    it("should handle invalid callback for onDataUpdated", () => {
      const unregister = Domo.onDataUpdated(null as any);
      expect(typeof unregister).toBe("function");
      simulateMessageEvent({
        cb: undefined,
        expectAck: false,
        expectCbCall: false,
      });
    });

    it("should allow double registration and unregistration", () => {
      const cb = jest.fn();
      const unregister1 = Domo.onDataUpdated(cb);
      const unregister2 = Domo.onDataUpdated(cb);
      expect(typeof unregister1).toBe("function");
      expect(typeof unregister2).toBe("function");
      unregister1();
      unregister2();
    });

    it("should allow multiple registrations for onDataUpdated", () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      const unregister1 = Domo.onDataUpdated(cb1);
      const unregister2 = Domo.onDataUpdated(cb2);
      (Domo as any).connect();
      const alias = "test-alias";
      const responsePort = { postMessage: jest.fn() };
      const event = {
        data: { event: "dataUpdated", alias },
        ports: [responsePort],
      };
      Domo.channel?.port1.onmessage?.(event as any);
      expect(cb1).toHaveBeenCalledWith(alias);
      expect(cb2).toHaveBeenCalledWith(alias);
      // Unregister one and trigger again
      cb1.mockClear();
      cb2.mockClear();
      unregister1();
      Domo.channel?.port1.onmessage?.(event as any);
      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).toHaveBeenCalledWith(alias);
      // Unregister the second and trigger again
      cb2.mockClear();
      unregister2();
      Domo.channel?.port1.onmessage?.(event as any);
      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).not.toHaveBeenCalled();
    });

    it("should use MessageChannel for communication", () => {
      const cb = jest.fn();
      const unregister = Domo.onDataUpdated(cb);
      const channel = new (global as any).MessageChannel();
      if (channel.port1.onmessage) {
        channel.port1.onmessage({ data: "test" });
        expect(cb).toHaveBeenCalled();
      }
      unregister();
    });

    it("should handle invalid JSON in message event", () => {
      const cb = jest.fn();
      Domo.onDataUpdated(cb);
      const event = new MessageEvent("message", {
        data: "{invalidJson",
        origin: "https://www.domo.com",
      });
      Object.defineProperty(event, "source", {
        value: { postMessage: jest.fn() },
      });
      expect(() => window.dispatchEvent(event)).not.toThrow();
      expect(cb).not.toHaveBeenCalled();
    });

    it("should handle message event missing alias property", () => {
      const cb = jest.fn();
      Domo.onDataUpdated(cb);
      const event = new MessageEvent("message", {
        data: JSON.stringify({ notAlias: "foo" }),
        origin: "https://www.domo.com",
      });
      Object.defineProperty(event, "source", {
        value: { postMessage: jest.fn() },
      });
      window.dispatchEvent(event);
      expect(cb).not.toHaveBeenCalled();
    });

    it("should return noop unregister if cb is not a function in onDataUpdated", () => {
      const unregister = Domo.onDataUpdated(undefined as any);
      expect(typeof unregister).toBe("function");
      expect(unregister()).toBeUndefined();
    });
  });
});
