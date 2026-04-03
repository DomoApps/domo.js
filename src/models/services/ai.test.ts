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

const mockAIResponse = {
  prompt: "test prompt",
  choices: [{ output: "test output" }],
  modelId: "model-123",
  isCustomerModel: false,
};

describe("ai.generateText", () => {
  it("should POST to text/generation with input", async () => {
    mockFetchOk(mockAIResponse);

    const res = await Domo.ai.generateText("Tell me a joke");

    expect(global.fetch).toHaveBeenCalledWith(
      "/domo/ai/v1/text/generation",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ input: "Tell me a joke" }),
      })
    );
    expect(res.choices[0].output).toBe("test output");
  });

  it("should include promptTemplate and parameters when provided", async () => {
    mockFetchOk(mockAIResponse);

    await Domo.ai.generateText("Recap the superbowl", {
      promptTemplate: { template: "${input}. Answer in ${max_words} words" },
      parameters: { max_words: "30" },
      model: "custom-model-id",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/domo/ai/v1/text/generation",
      expect.objectContaining({
        body: JSON.stringify({
          input: "Recap the superbowl",
          promptTemplate: { template: "${input}. Answer in ${max_words} words" },
          parameters: { max_words: "30" },
          model: "custom-model-id",
        }),
      })
    );
  });
});

describe("ai.textToSQL", () => {
  it("should POST to text/sql with input and schemas", async () => {
    mockFetchOk(mockAIResponse);

    const schemas = [{
      dataSourceName: "Sales",
      columns: [
        { name: "Date", type: "date" },
        { name: "Amount", type: "number" },
      ],
    }];

    const res = await Domo.ai.textToSQL("Show total sales", { dataSourceSchemas: schemas });

    expect(global.fetch).toHaveBeenCalledWith(
      "/domo/ai/v1/text/sql",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          input: "Show total sales",
          dataSourceSchemas: schemas,
        }),
      })
    );
    expect(res.choices).toHaveLength(1);
  });

  it("should work with just input", async () => {
    mockFetchOk(mockAIResponse);

    await Domo.ai.textToSQL("Generate a query");

    expect(global.fetch).toHaveBeenCalledWith(
      "/domo/ai/v1/text/sql",
      expect.objectContaining({
        body: JSON.stringify({ input: "Generate a query" }),
      })
    );
  });
});

describe("ai.imageToText", () => {
  it("should POST to image/text with image data", async () => {
    mockFetchOk(mockAIResponse);

    const res = await Domo.ai.imageToText(
      "extract text from image",
      { mediaType: "image/png", type: "base64", data: "abc123" },
      "domo.model.v1",
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "/domo/ai/v1/image/text",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          input: "extract text from image",
          image: { mediaType: "image/png", type: "base64", data: "abc123" },
          model: "domo.model.v1",
        }),
      })
    );
    expect(res.choices[0].output).toBe("test output");
  });

  it("should strip data URL prefix from base64", async () => {
    mockFetchOk(mockAIResponse);

    await Domo.ai.imageToText(
      "read this",
      { mediaType: "image/png", type: "base64", data: "data:image/png;base64,abc123" },
      "domo.model.v1",
    );

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.image.data).toBe("abc123");
  });

  it("should include system prompt and promptTemplate when provided", async () => {
    mockFetchOk(mockAIResponse);

    await Domo.ai.imageToText(
      "read this",
      { mediaType: "image/png", type: "base64", data: "abc" },
      "domo.model.v1",
      {
        system: "You are an OCR assistant",
        promptTemplate: { template: "${input}" },
      },
    );

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.system).toBe("You are an OCR assistant");
    expect(body.promptTemplate.template).toBe("${input}");
  });

  it("should reject on server error", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "AI service unavailable",
      body: {},
    });

    await expect(
      Domo.ai.generateText("test")
    ).rejects.toThrow("AI service unavailable");
  });
});
