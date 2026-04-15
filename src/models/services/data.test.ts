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

describe("data.query", () => {
  it("should GET from /data/v1/{alias}", async () => {
    const rows = [{ name: "Alice", amount: 100 }];
    mockFetchOk(rows);

    const result = await Domo.data.query("sales");

    expect(global.fetch).toHaveBeenCalledWith(
      "/data/v1/sales",
      expect.any(Object)
    );
    expect(result).toEqual(rows);
  });

  it("should append basic query params", async () => {
    mockFetchOk([]);

    await Domo.data.query("sales", {
      fields: ["name", "amount"],
      filter: "amount > 100",
      orderBy: "amount descending",
      groupBy: ["name"],
      limit: 50,
      offset: 10,
    });

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("/data/v1/sales?");
    expect(url).toContain("fields=name%2Camount");
    expect(url).toContain("filter=amount+%3E+100");
    expect(url).toContain("orderby=amount+descending");
    expect(url).toContain("groupby=name");
    expect(url).toContain("limit=50");
    expect(url).toContain("offset=10");
  });

  it("should support aggregation operators", async () => {
    mockFetchOk([]);

    await Domo.data.query("sales", {
      sum: ["amount"],
      avg: ["price"],
      count: ["id"],
      max: ["amount"],
      min: ["amount"],
      unique: ["region"],
    });

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("sum=amount");
    expect(url).toContain("avg=price");
    expect(url).toContain("count=id");
    expect(url).toContain("max=amount");
    expect(url).toContain("min=amount");
    expect(url).toContain("unique=region");
  });

  it("should support dateGrain and calendar", async () => {
    mockFetchOk([]);

    await Domo.data.query("sales", {
      dateGrain: "orderDate by month",
      calendar: "fiscal",
    });

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("dategrain=orderDate+by+month");
    expect(url).toContain("calendar=fiscal");
  });

  it("should support useBeastMode", async () => {
    mockFetchOk([]);

    await Domo.data.query("sales", {
      useBeastMode: true,
      fields: ["myBeastMode"],
    });

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("useBeastMode=true");
    expect(url).toContain("fields=myBeastMode");
  });

  it("should pass format to request options", async () => {
    mockFetchOk("csv,data");

    await Domo.data.query("sales", { format: "csv" });

    expect(global.fetch).toHaveBeenCalledWith(
      "/data/v1/sales",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "text/csv",
        }),
      })
    );
  });

  it("should encode special characters in alias", async () => {
    mockFetchOk([]);

    await Domo.data.query("my dataset");

    expect(global.fetch).toHaveBeenCalledWith(
      "/data/v1/my%20dataset",
      expect.any(Object)
    );
  });
});

describe("data.sql", () => {
  it("should POST to /sql/v1/{alias} with SQL as body and text/plain content type", async () => {
    const rows = [{ total: 500 }];
    mockFetchOk(rows);

    const result = await Domo.data.sql("sales", "SELECT SUM(amount) as total FROM sales");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/sql/v1/sales"),
      expect.objectContaining({
        method: "POST",
        body: "SELECT SUM(amount) as total FROM sales",
        headers: expect.objectContaining({
          "Content-Type": "text/plain",
        }),
      })
    );
    expect(result).toEqual(rows);
  });
});
