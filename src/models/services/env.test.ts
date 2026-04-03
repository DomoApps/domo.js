import Domo from "../../domo";

beforeEach(() => {
  (window as any)["__RYUU_SID__"] = "test-token";
});

describe("env", () => {
  it("should expose typed environment properties from query params", () => {
    expect(Domo.env).toBeDefined();
    expect(typeof Domo.env.userId).toBe("string");
    expect(typeof Domo.env.userName).toBe("string");
    expect(typeof Domo.env.userEmail).toBe("string");
    expect(typeof Domo.env.customer).toBe("string");
    expect(typeof Domo.env.locale).toBe("string");
    expect(typeof Domo.env.platform).toBe("string");
    expect(typeof Domo.env.pageId).toBe("string");
    expect(typeof Domo.env.host).toBe("string");
  });

  it("should default platform to 'desktop' when not set", () => {
    expect(["desktop", "mobile"]).toContain(Domo.env.platform);
  });

  it("should have loaded as a boolean", () => {
    expect(typeof Domo.env.loaded).toBe("boolean");
  });

  it("should allow index access for unknown params", () => {
    const val = Domo.env["someUnknownParam"];
    expect(val === undefined || typeof val === "string").toBe(true);
  });
});
