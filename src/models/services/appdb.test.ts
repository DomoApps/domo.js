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

const BASE = "/domo/datastores/v1/collections";
const COLL = "Users";

describe("appdb document CRUD", () => {
  it("list - should GET all documents", async () => {
    mockFetchOk([{ id: "1" }]);
    const result = await Domo.appdb.list(COLL);
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/${COLL}/documents/`,
      expect.objectContaining({ method: "GET" })
    );
    expect(result).toEqual([{ id: "1" }]);
  });

  it("get - should GET a single document", async () => {
    mockFetchOk({ id: "abc" });
    await Domo.appdb.get(COLL, "abc");
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/${COLL}/documents/abc`,
      expect.objectContaining({ method: "GET" })
    );
  });

  it("create - should auto-wrap in content", async () => {
    mockFetchOk({ id: "new" });
    const result = await Domo.appdb.create(COLL, { username: "Bill" });
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/${COLL}/documents/`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ content: { username: "Bill" } }) })
    );
    expect(result.id).toBe("new");
  });

  it("create - should pass through if already wrapped", async () => {
    mockFetchOk({ id: "new" });
    await Domo.appdb.create(COLL, { content: { username: "Bill" } });
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/${COLL}/documents/`,
      expect.objectContaining({ body: JSON.stringify({ content: { username: "Bill" } }) })
    );
  });

  it("update - should auto-wrap in content", async () => {
    mockFetchOk({ id: "abc" });
    await Domo.appdb.update(COLL, "abc", { username: "Ted" });
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/${COLL}/documents/abc`,
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ content: { username: "Ted" } }) })
    );
  });

  it("remove - should DELETE a document", async () => {
    mockFetchOk({});
    await Domo.appdb.remove(COLL, "abc");
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/${COLL}/documents/abc`,
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

describe("appdb query", () => {
  it("should POST a MongoDB query", async () => {
    mockFetchOk([{ id: "1" }]);
    await Domo.appdb.query(COLL, { "content.region": "West" });
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/${COLL}/documents/query`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ "content.region": "West" }),
      })
    );
  });

  it("should append aggregation params as query string", async () => {
    mockFetchOk([]);
    await Domo.appdb.query(COLL, {}, {
      groupby: "content.name",
      count: "docCount",
      sum: "content.amount total",
      orderby: "total descending",
      limit: 100,
    });
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("/documents/query?");
    expect(url).toContain("groupby=content.name");
    expect(url).toContain("count=docCount");
    expect(url).toContain("sum=content.amount+total");
    expect(url).toContain("orderby=total+descending");
    expect(url).toContain("limit=100");
  });
});

describe("appdb partialUpdate", () => {
  it("should PUT query + operation to /documents/update", async () => {
    mockFetchOk(1);
    await Domo.appdb.partialUpdate(
      COLL,
      { "content.username": "Bill" },
      { "$set": { "content.comment": "Excellent!" } },
    );
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/${COLL}/documents/update`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          query: { "content.username": "Bill" },
          operation: { "$set": { "content.comment": "Excellent!" } },
        }),
      })
    );
  });
});

describe("appdb bulk operations", () => {
  it("bulkCreate - should auto-wrap each document", async () => {
    mockFetchOk({ Created: 2 });
    await Domo.appdb.bulkCreate(COLL, [{ username: "Bill" }, { username: "Ted" }]);
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/${COLL}/documents/bulk`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify([{ content: { username: "Bill" } }, { content: { username: "Ted" } }]),
      })
    );
  });

  it("bulkUpsert - should auto-wrap and preserve id", async () => {
    mockFetchOk({ Updated: 1, Created: 1 });
    await Domo.appdb.bulkUpsert(COLL, [
      { id: "existing", username: "Bill" },
      { username: "Rufus" },
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/${COLL}/documents/bulk`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify([
          { content: { username: "Bill" }, id: "existing" },
          { content: { username: "Rufus" } },
        ]),
      })
    );
  });

  it("bulkDelete - should DELETE with ids query param", async () => {
    mockFetchOk({ Deleted: 2 });
    await Domo.appdb.bulkDelete(COLL, ["id-1", "id-2"]);
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/${COLL}/documents/bulk?ids=id-1,id-2`,
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

describe("appdb export", () => {
  it("should POST to /export", async () => {
    mockFetchOk({});
    await Domo.appdb.export();
    expect(global.fetch).toHaveBeenCalledWith(
      "/domo/datastores/v1/export",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("should include includeRelatedCollections param", async () => {
    mockFetchOk({});
    await Domo.appdb.export(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "/domo/datastores/v1/export?includeRelatedCollections=true",
      expect.any(Object)
    );
  });
});

describe("appdb collection management", () => {
  it("listCollections - should GET /collections/", async () => {
    mockFetchOk([]);
    await Domo.appdb.listCollections();
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/`,
      expect.objectContaining({ method: "GET" })
    );
  });

  it("createCollection - should POST to /collections", async () => {
    mockFetchOk({ id: "new-coll" });
    await Domo.appdb.createCollection({
      name: "Users",
      schema: { columns: [{ name: "username", type: "STRING" }] },
      syncEnabled: true,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      BASE,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("updateCollection - should PUT to /collections/{name}", async () => {
    mockFetchOk({});
    await Domo.appdb.updateCollection(COLL, { syncEnabled: false });
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/${COLL}`,
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("deleteCollection - should DELETE /collections/{name}", async () => {
    mockFetchOk({});
    await Domo.appdb.deleteCollection(COLL);
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/${COLL}`,
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

describe("appdb query with spaces in groupby", () => {
  it("should encode spaces in groupby field names as +", async () => {
    mockFetchOk([]);
    await Domo.appdb.query(COLL, {}, {
      groupby: "content.Work Item Owner",
      count: "ownerCount",
    });
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("groupby=content.Work+Item+Owner");
    expect(url).toContain("count=ownerCount");
  });

  it("should encode spaces in multiple groupby fields", async () => {
    mockFetchOk([]);
    await Domo.appdb.query(COLL, {}, {
      groupby: "content.Work Item Owner, content.Task Name",
      sum: "content.Story Points totalPoints",
    });
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("groupby=content.Work+Item+Owner%2C+content.Task+Name");
    expect(url).toContain("sum=content.Story+Points+totalPoints");
  });
});

describe("appdb URL encoding", () => {
  it("should encode special characters", async () => {
    mockFetchOk({});
    await Domo.appdb.remove("my collection", "doc/id");
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/my%20collection/documents/doc%2Fid`,
      expect.any(Object)
    );
  });
});
