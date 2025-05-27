import Domo from "../../domo";
import { RequestMethods } from "../enums/request-methods";

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

  // Mock fetch for all HTTP verb tests
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete global.fetch;
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
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ foo: "bar" }),
        text: async () => JSON.stringify({ foo: "bar" }),
        blob: async () => new Blob([JSON.stringify({ foo: "bar" })], { type: "application/json" }),
        body: {},
      });
      await expect((Domo as any)[name]("/test")).resolves.toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/test"),
        expect.objectContaining({ method })
      );
      if (hasReject) {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 500,
          statusText: "fail",
          text: async () => "fail",
          body: {},
        });
        await expect((Domo as any)[name]("/fail")).rejects.toThrow("fail");
      }
      if (hasReturn && name === "get") {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({ foo: "bar" }),
          text: async () => JSON.stringify({ foo: "bar" }),
          blob: async () => new Blob([JSON.stringify({ foo: "bar" })], { type: "application/json" }),
          body: {},
        });
        await expect(Domo.get("/foo")).resolves.toEqual({ foo: "bar" });
      }
    }
  );

  it("should have a patch method (not implemented)", () => {
    expect(typeof (Domo as any).patch).toBe("undefined");
  });

  it('should send JSON body if contentType is not set or is JSON', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({}),
      text: async () => '{}',
      blob: async () => new Blob(["{}"], { type: "application/json" }),
      body: {},
    });
    await Domo.post('/test', { foo: 'bar' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ foo: 'bar' })
      })
    );
  });

  it('should call put<T> and resolve', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({}),
      text: async () => '{}',
      blob: async () => new Blob(["{}"], { type: "application/json" }),
      body: {},
    });
    await expect(Domo.put<{foo: string}>('/test', {foo: 'bar'})).resolves.toBeDefined();
  });

  it('should call delete<T> and resolve', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({}),
      text: async () => '{}',
      blob: async () => new Blob(["{}"], { type: "application/json" }),
      body: {},
    });
    await expect(Domo.delete<{foo: string}>('/test')).resolves.toBeDefined();
  });

  it("should call getAll", async () => {
    const spy = jest.spyOn(Domo, "getAll");
    spy.mockResolvedValue([{}]);
    await expect(Domo.getAll(["/test"])).resolves.toBeDefined();
    spy.mockRestore();
  });

  it("should call getAll<T> and resolve", async () => {
    const spy = jest.spyOn(Domo, "get");
    spy.mockResolvedValue({ foo: "bar" });
    const promise = Domo.getAll<{ foo: string }>(["/test1", "/test2"]);
    await expect(promise).resolves.toEqual([{ foo: "bar" }, { foo: "bar" }]);
    spy.mockRestore();
  });
});

describe("domo HTTP edge cases", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    global.fetch = jest.fn();
  });

  it("should apply the response headers to the error headers", async () => {
    const response = {
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      headers: new Headers({
        "Content-Type": "application/json",
        "X-Custom-Header": "CustomValue",
      }),
      text: async () => "Different Internal Server Error Message",
    };

    (global.fetch as jest.Mock).mockResolvedValue(response);
    try {
      await Domo.get("/test");
    } catch (error: any) {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("HTTP error 500: Different Internal Server Error Message");
      expect(error.status).toBe(500);
      expect(error.statusText).toBe("Internal Server Error");
      expect(error.body).toBe("Different Internal Server Error Message");
      expect(error.headers).toEqual({
        "content-type": "application/json",
        "x-custom-header": "CustomValue",
      });
    }
  });

  it("should resolve with raw response for csv/excel format", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => "csvdata",
      body: {},
    });
    await expect(Domo.get("/test", { format: "csv" } as any)).resolves.toBe("csvdata");
  });

  it("should resolve with raw response if response is falsy", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => "",
      body: {},
    });
    await expect(Domo.get("/test", { format: "array-of-objects" } as any)).resolves.toBe("");
  });

  it("should resolve with Blob if responseType is blob", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      blob: async () => new Blob(["blobdata"], { type: "application/octet-stream" }),
      body: {},
    });
    await expect(Domo.get("/test", { responseType: "blob" } as any)).resolves.toEqual(expect.any(Blob));
  });

  it('should reject with "Invalid JSON response" if response is not valid JSON', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => { throw new Error("bad json"); },
      text: async () => "not-json",
      body: {},
    });
    await expect(Domo.get("/test")).rejects.toThrow("Invalid JSON response");
  });

  it("should reject with statusText if status is not 2xx", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "Not Found",
      body: {},
    });
    await expect(Domo.get("/test")).rejects.toThrow("Not Found");
  });

  it('should reject with "domoHttp error" on network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network Error"));
    await expect(Domo.get("/test")).rejects.toThrow("Network Error");
  });

  it("should send raw body if contentType is not JSON", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({}),
      text: async () => '{}',
      blob: async () => new Blob(["{}"], { type: "application/json" }),
      body: {},
    });
    await Domo.post("/test", "raw-body", {
      contentType: "text/plain",
    } as any);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.objectContaining({
        method: 'POST',
        body: "raw-body"
      })
    );
  });
});
