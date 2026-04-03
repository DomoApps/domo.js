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

const mockInstance = {
  id: "2052e10a-d142-4391-a731-2be1ab1c0188",
  modelId: "a8afdc89-9491-4ee4-b7c3-b9e9b86c0138",
  modelName: "AddTwoNumbers",
  modelVersion: "1.1.0",
  createdBy: "8811501",
  createdOn: "2023-11-15T15:28:57.479Z",
  updatedBy: "8811501",
  updatedOn: "2023-11-15T15:28:57.479Z",
  status: null as null,
};

describe("workflow.start", () => {
  it("should POST to the correct start URL with body", async () => {
    mockFetchOk(mockInstance);

    const result = await Domo.workflow.start("addNumbers", { num1: 5, num2: 10 });

    expect(global.fetch).toHaveBeenCalledWith(
      "/domo/workflow/v1/models/addNumbers/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ num1: 5, num2: 10 }),
      })
    );
    expect(result.id).toBe(mockInstance.id);
    expect(result.modelName).toBe("AddTwoNumbers");
  });

  it("should send empty object when no body is provided", async () => {
    mockFetchOk(mockInstance);

    await Domo.workflow.start("noParams");

    expect(global.fetch).toHaveBeenCalledWith(
      "/domo/workflow/v1/models/noParams/start",
      expect.objectContaining({
        body: JSON.stringify({}),
      })
    );
  });

  it("should encode special characters in the alias", async () => {
    mockFetchOk(mockInstance);

    await Domo.workflow.start("my workflow");

    expect(global.fetch).toHaveBeenCalledWith(
      "/domo/workflow/v1/models/my%20workflow/start",
      expect.any(Object)
    );
  });
});

describe("workflow.metrics", () => {
  const mockMetrics = {
    modelId: "a8afdc89-9491-4ee4-b7c3-b9e9b86c0138",
    version: "1.1.0",
    completedWorkflows: 3,
    inProgressWorkflows: 2,
    failedWorkflows: 1,
    canceledWorkflows: 0,
    averageCycleTime: 120,
    instanceMetric: [] as any[],
  };

  it("should GET metrics without query params", async () => {
    mockFetchOk(mockMetrics);

    const result = await Domo.workflow.metrics("addNumbers");

    expect(global.fetch).toHaveBeenCalledWith(
      "/domo/workflow/v1/models/addNumbers/overall",
      expect.any(Object)
    );
    expect(result.completedWorkflows).toBe(3);
  });

  it("should append query params when provided", async () => {
    mockFetchOk(mockMetrics);

    await Domo.workflow.metrics("addNumbers", { status: "COMPLETED", limit: 10 });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/domo/workflow/v1/models/addNumbers/overall?"),
      expect.any(Object)
    );
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("status=COMPLETED");
    expect(url).toContain("limit=10");
  });

  it("should skip undefined params", async () => {
    mockFetchOk(mockMetrics);

    await Domo.workflow.metrics("addNumbers", { limit: 5, offset: undefined });

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("limit=5");
    expect(url).not.toContain("offset");
  });
});

describe("workflow.getInstance", () => {
  it("should GET the instance by alias and instanceId", async () => {
    const completed = { ...mockInstance, status: "COMPLETED" };
    mockFetchOk(completed);

    const result = await Domo.workflow.getInstance("addNumbers", "2052e10a-d142-4391-a731-2be1ab1c0188");

    expect(global.fetch).toHaveBeenCalledWith(
      "/domo/workflow/v1/models/addNumbers/instance/2052e10a-d142-4391-a731-2be1ab1c0188",
      expect.any(Object)
    );
    expect(result.status).toBe("COMPLETED");
  });

  it("should reject on server error", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "Workflow not found",
      body: {},
    });

    await expect(
      Domo.workflow.getInstance("badAlias", "nonexistent-id")
    ).rejects.toThrow("Workflow not found");
  });
});
