import Domo from "../../domo";

beforeEach(() => {
  jest.resetAllMocks();
  (window as any)["__RYUU_SID__"] = "test-token";
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete (global as any).fetch;
});

const mockFetchOk = (data: any) => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify(data),
    json: async () => data,
    blob: async () => new Blob([JSON.stringify(data)]),
    body: {},
  });
};

describe("codeEngine", () => {
  it("should POST to the correct Code Engine URL with input params", async () => {
    mockFetchOk({ result: 42 });

    const result = await Domo.codeEngine("myFunc", { param1: "hello" });

    expect(global.fetch).toHaveBeenCalledWith(
      "/domo/codeengine/v2/packages/myFunc",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ param1: "hello" }),
      })
    );
    expect(result).toEqual({ result: 42 });
  });

  it("should send empty object when no input is provided", async () => {
    mockFetchOk("ok");

    await Domo.codeEngine("noParams");

    expect(global.fetch).toHaveBeenCalledWith(
      "/domo/codeengine/v2/packages/noParams",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({}),
      })
    );
  });

  it("should encode special characters in the function alias", async () => {
    mockFetchOk({});

    await Domo.codeEngine("my func/special");

    expect(global.fetch).toHaveBeenCalledWith(
      "/domo/codeengine/v2/packages/my%20func%2Fspecial",
      expect.any(Object)
    );
  });

  it("should reject when the server returns an error", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Function execution failed",
      body: {},
    });

    await expect(
      Domo.codeEngine("badFunc", { x: 1 })
    ).rejects.toThrow("Function execution failed");
  });

  it("should support typed generics", async () => {
    interface MyOutput { score: number; label: string }
    mockFetchOk({ score: 95, label: "high" });

    const result = await Domo.codeEngine<MyOutput>("scorer", { input: "data" });

    expect(result.score).toBe(95);
    expect(result.label).toBe("high");
  });
});
