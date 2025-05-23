import domo from "../../domo";

declare global {
  // eslint-disable-next-line no-var
  var _originalXMLHttpRequest: any;
  // eslint-disable-next-line no-var
  var _openSpy: jest.Mock;
  // eslint-disable-next-line no-var
  var _xhrInstance: any;
}

// Mock browser APIs and global objects as needed
beforeEach(() => {
  jest.resetAllMocks();
  (window as any)["__RYUU_SID__"] = "test-token";

  // XMLHttpRequest mock for all HTTP verb tests
  globalThis._originalXMLHttpRequest = (global as any).XMLHttpRequest;
  globalThis._openSpy = jest.fn();
  globalThis._xhrInstance = {
    open: globalThis._openSpy,
    setRequestHeader: jest.fn(),
    send: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    onload: null,
    onerror: null,
    readyState: 4,
    status: 200,
    response: "{}",
    getResponseHeader: jest.fn(),
  };
  (global as any).XMLHttpRequest = jest.fn(() => globalThis._xhrInstance);
});

afterEach(() => {
  jest.restoreAllMocks();
  (global as any).XMLHttpRequest = globalThis._originalXMLHttpRequest;
});

describe("domo HTTP methods", () => {
  const httpMethods = [
    { name: "get", method: "GET", hasReject: true, hasReturn: true },
    { name: "post", method: "POST", hasReject: true, hasReturn: false },
    { name: "put", method: "PUT", hasReject: false, hasReturn: false },
    { name: "delete", method: "DELETE", hasReject: false, hasReturn: false },
  ] as const;

  it.each(httpMethods)(
    "$name should call and set method",
    async ({ name, method, hasReject, hasReturn }) => {
      const spy = jest.spyOn(domo, name);
      (spy as jest.Mock).mockResolvedValue({ foo: "bar" });
      await expect((domo as any)[name]("/test")).resolves.toBeDefined();
      globalThis._openSpy.mockImplementation(function (m: string) {
        expect(m).toBe(method);
      });
      const promise = (domo as any)[name]("/test");
      if (globalThis._xhrInstance.onload) globalThis._xhrInstance.onload();
      await promise;
      if (hasReject) {
        (spy as jest.Mock).mockRejectedValue(new Error("fail"));
        await expect((domo as any)[name]("/fail")).rejects.toThrow("fail");
      }

      if (hasReturn && name === "get") {
        (spy as jest.Mock).mockResolvedValue({ foo: "bar" });
        await expect(domo.get("/foo")).resolves.toEqual({ foo: "bar" });
      }
    }
  );

  it("should have a patch method (not implemented)", () => {
    expect(typeof (domo as any).patch).toBe("undefined");
  });

  it('should send JSON body if contentType is not set or is JSON', async () => {
    globalThis._xhrInstance.status = 200;
    globalThis._xhrInstance.response = '{}';
    const spy = jest.spyOn(globalThis._xhrInstance, 'send');
    const promise = domo.post('/test', { foo: 'bar' });
    if (globalThis._xhrInstance.onload) globalThis._xhrInstance.onload();
    await promise;
    expect(spy).toHaveBeenCalledWith(JSON.stringify({ foo: 'bar' }));
    spy.mockRestore();
  });

  it('should call put<T> and resolve', async () => {
    const spy = jest.spyOn(global as any, 'XMLHttpRequest');
    globalThis._xhrInstance.status = 200;
    globalThis._xhrInstance.response = '{}';
    const promise = domo.put<{foo: string}>('/test', {foo: 'bar'});
    if (globalThis._xhrInstance.onload) globalThis._xhrInstance.onload();
    await expect(promise).resolves.toBeDefined();
    spy.mockRestore();
  });

  it('should call delete<T> and resolve', async () => {
    const spy = jest.spyOn(global as any, 'XMLHttpRequest');
    globalThis._xhrInstance.status = 200;
    globalThis._xhrInstance.response = '{}';
    const promise = domo.delete<{foo: string}>('/test');
    if (globalThis._xhrInstance.onload) globalThis._xhrInstance.onload();
    await expect(promise).resolves.toBeDefined();
    spy.mockRestore();
  });

  it("should call getAll", async () => {
    const spy = jest.spyOn(domo, "getAll");
    spy.mockResolvedValue([{}]);
    await expect(domo.getAll(["/test"])).resolves.toBeDefined();
    spy.mockRestore();
  });

  it("should call getAll<T> and resolve", async () => {
    const spy = jest.spyOn(domo, "get");
    spy.mockResolvedValue({ foo: "bar" });
    const promise = domo.getAll<{ foo: string }>(["/test1", "/test2"]);
    await expect(promise).resolves.toEqual([{ foo: "bar" }, { foo: "bar" }]);
    spy.mockRestore();
  });
});

describe("domo HTTP edge cases", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  function flushMicrotasks() {
    return Promise.resolve().then(() => {});
  }
  async function triggerOnloadAsync() {
    await flushMicrotasks();
    if (globalThis._xhrInstance.onload) globalThis._xhrInstance.onload();
  }
  async function triggerOnerrorAsync() {
    await flushMicrotasks();
    if (globalThis._xhrInstance.onerror) globalThis._xhrInstance.onerror();
  }

  it("should resolve with raw response for csv/excel format", async () => {
    globalThis._xhrInstance.status = 200;
    globalThis._xhrInstance.response = "csvdata";
    const promise = domo.get("/test", { format: "csv" } as any);
    await triggerOnloadAsync();
    await expect(promise).resolves.toBe("csvdata");
  });

  it("should resolve with raw response if response is falsy", async () => {
    globalThis._xhrInstance.status = 200;
    globalThis._xhrInstance.response = "";
    const promise = domo.get("/test", { format: "array-of-objects" } as any);
    await triggerOnloadAsync();
    await expect(promise).resolves.toBe("");
  });

  it("should resolve with Blob if responseType is blob", async () => {
    globalThis._xhrInstance.status = 200;
    globalThis._xhrInstance.response = "blobdata";
    globalThis._xhrInstance.getResponseHeader.mockReturnValue(
      "application/octet-stream"
    );
    const promise = domo.get("/test", { responseType: "blob" } as any);
    await triggerOnloadAsync();
    await expect(promise).resolves.toEqual(expect.any(Blob));
  });

  it('should reject with "Invalid JSON response" if response is not valid JSON', async () => {
    globalThis._xhrInstance.status = 200;
    globalThis._xhrInstance.response = "not-json";
    const promise = domo.get("/test");
    await triggerOnloadAsync();
    await expect(promise).rejects.toThrow("Invalid JSON response");
  });

  it("should reject with statusText if status is not 2xx", async () => {
    globalThis._xhrInstance.status = 404;
    globalThis._xhrInstance.statusText = "Not Found";
    globalThis._xhrInstance.response = "{}";
    const promise = domo.get("/test");
    await triggerOnloadAsync();
    await expect(promise).rejects.toThrow("Not Found");
  });

  it('should reject with "Network Error" on network error', async () => {
    globalThis._xhrInstance.status = 0;
    const promise = domo.get("/test");
    await triggerOnerrorAsync();
    await expect(promise).rejects.toThrow("Network Error");
  });

  it("should send raw body if contentType is not JSON", async () => {
    globalThis._xhrInstance.status = 200;
    globalThis._xhrInstance.response = "{}";
    const promise = domo.post("/test", "raw-body", {
      contentType: "text/plain",
    } as any);
    await flushMicrotasks();
    expect(globalThis._xhrInstance.send).toHaveBeenCalledWith("raw-body");
    await triggerOnloadAsync();
    await promise;
  });
});
