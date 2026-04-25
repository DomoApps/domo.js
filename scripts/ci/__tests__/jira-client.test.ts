import { countOpenBlockers } from "../jira-client";

const config = {
  baseUrl: "https://example.atlassian.net",
  email: "ci@example.com",
  apiToken: "tok-123",
  projectKey: "RYUU",
};

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

afterEach(() => mockFetch.mockClear());

describe("countOpenBlockers", () => {
  it("returns the total count from the search response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ total: 2, issues: [] } as { total: number; issues: any[] }),
    });

    const count = await countOpenBlockers(config, "version:6.0.3-alpha");
    expect(count).toBe(2);

    // Verify the request was correct
    const [url, options] = mockFetch.mock.calls[0] as any;
    expect(url).toBe(`${config.baseUrl}/rest/api/3/search`);
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toMatch(/^Basic /);
    expect(options.headers.Accept).toBe("application/json");

    const body = JSON.parse(options.body);
    expect(body.jql).toBe(
      'project = "RYUU" AND labels = "version:6.0.3-alpha" ' +
        'AND priority in (Critical, Major) AND status != Done',
    );
    expect(body.fields).toEqual([]);
    expect(body.maxResults).toBe(0);
  });

  it("returns 0 when total is 0", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ total: 0, issues: [] } as { total: number; issues: any[] }),
    });
    expect(await countOpenBlockers(config, "version:6.0.3-alpha")).toBe(0);
  });

  it("throws on non-2xx response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });
    await expect(
      countOpenBlockers(config, "version:6.0.3-alpha"),
    ).rejects.toThrow(/Jira returned 401/);
  });
});
